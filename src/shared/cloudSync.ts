import { decode } from 'base64-arraybuffer';

import { getUserId, supabase } from './supabase';
import type { ScanRecord } from './history';

const BUCKET = 'scans';

/**
 * Where a scan's image sits in the bucket - the row itself carries no path
 * column. The convention is the schema: given a user id and a scan id, both
 * upload and download derive the same path independently, so there is
 * nothing to keep in sync between a row and its objects, and one row is one
 * network write instead of an insert followed by an update.
 */
function objectPath(userId: string, id: string, kind: 'thumb' | 'preview') {
  return `${userId}/${id}-${kind}.jpg`;
}

/**
 * Mirrors one finished scan to Supabase: the row, then its thumbnail.
 *
 * Fire-and-forget from the caller's side - scanning has to work with no
 * signal, so this never blocks or throws into the UI. A failed upload here
 * just means that scan is missing from the cloud copy until the next
 * successful sync; the local AsyncStorage copy the app actually reads from
 * is unaffected either way.
 */
export async function uploadScan(
  record: ScanRecord,
  thumbnail: string,
): Promise<void> {
  const userId = await getUserId();
  if (userId == null) return;

  const { error: insertError } = await supabase.from('scans').insert({
    id: record.id,
    user_id: userId,
    at: new Date(record.at).toISOString(),
    people: record.people,
    total: record.total,
    counts: record.counts,
  });
  if (insertError != null) {
    console.warn('[cloudSync] could not upload scan row', insertError);
    return;
  }

  if (thumbnail === '') return;
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath(userId, record.id, 'thumb'), decode(thumbnail), {
      contentType: 'image/jpeg',
    });
  if (storageError != null) {
    console.warn('[cloudSync] could not upload thumbnail', storageError);
  }
}

/** Uploads the full-size preview once it exists - see makePreview, it is
 *  encoded after the scan itself already finished saving. */
export async function uploadPreview(id: string, preview: string): Promise<void> {
  const userId = await getUserId();
  if (userId == null) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath(userId, id, 'preview'), decode(preview), {
      contentType: 'image/jpeg',
    });
  if (error != null) {
    console.warn('[cloudSync] could not upload preview', error);
  }
}

/** Deletes rows and both possible images for a batch of scans, best effort. */
export async function deleteScans(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getUserId();
  if (userId == null) return;

  const { error: rowError } = await supabase
    .from('scans')
    .delete()
    .in('id', ids);
  if (rowError != null) {
    console.warn('[cloudSync] could not delete scan rows', rowError);
  }

  // Deleting a name that was never uploaded (e.g. a scan with no thumbnail,
  // or one saved before previews existed) is not an error worth reporting -
  // the storage API itself does not treat a missing object as a failure.
  const paths = ids.flatMap(id => [
    objectPath(userId, id, 'thumb'),
    objectPath(userId, id, 'preview'),
  ]);
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove(paths);
  if (storageError != null) {
    console.warn('[cloudSync] could not delete scan images', storageError);
  }
}

/**
 * Rebuilds a history from the cloud after a reinstall finds AsyncStorage
 * empty. Only thumbnails come down, not previews - previews stay lazily
 * fetched on open exactly as they are for local history (see loadPreview in
 * useScanHistory.ts), so a restore does not pay for images nobody has asked
 * to see yet.
 *
 * Returns an empty array on any failure - no session yet, no network, no
 * rows - so the caller falls back to "no history" instead of erroring out on
 * the very first launch.
 */
export async function restoreFromCloud(limit: number): Promise<ScanRecord[]> {
  const userId = await getUserId();
  if (userId == null) return [];

  const { data, error } = await supabase
    .from('scans')
    .select('id, at, people, total, counts')
    .eq('user_id', userId)
    .order('at', { ascending: false })
    .limit(limit);
  if (error != null || data == null) {
    console.warn('[cloudSync] could not restore history', error);
    return [];
  }

  const records = await Promise.all(
    data.map(async (row): Promise<ScanRecord> => {
      const { data: file } = await supabase.storage
        .from(BUCKET)
        .download(objectPath(userId, row.id, 'thumb'));
      const thumbnail = file == null ? '' : await blobToBase64(file);
      return {
        id: row.id,
        at: new Date(row.at).getTime(),
        people: row.people,
        total: row.total,
        counts: row.counts,
        thumbnail,
      };
    }),
  );
  return records;
}

/** Downloads one scan's preview on demand - the cloud-backed half of
 *  loadPreview, tried only after the local cache misses. */
export async function downloadPreview(id: string): Promise<string | null> {
  const userId = await getUserId();
  if (userId == null) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(objectPath(userId, id, 'preview'));
  if (error != null || data == null) return null;
  return blobToBase64(data);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('could not read the downloaded image'));
    reader.readAsDataURL(blob);
  });
}
