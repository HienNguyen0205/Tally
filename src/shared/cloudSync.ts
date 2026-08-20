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
 * signal, so this never blocks or throws into the UI. The local MMKV copy the
 * app actually reads from is unaffected either way; what a failure costs is a
 * gap in the cloud backup, which is why the boolean matters (see below).
 *
 * Returns whether the scan is now fully in the cloud. False keeps the id in
 * the retry queue - see shared/pendingSync.ts - so a scan taken with no
 * signal is not silently lost from the backup forever, which is exactly what
 * used to happen when this returned void and the caller only logged.
 *
 * Idempotent, because a retry has no way to know how much of the previous
 * attempt landed: the row upserts rather than inserts, and the object upload
 * passes `upsert` so re-sending an image that already arrived is a write, not
 * a "resource already exists" error that would wedge the queue permanently.
 */
export async function uploadScan(
  record: ScanRecord,
  thumbnail: string,
): Promise<boolean> {
  const userId = await getUserId();
  if (userId == null) return false;

  const { error: upsertError } = await supabase.from('scans').upsert({
    id: record.id,
    user_id: userId,
    at: new Date(record.at).toISOString(),
    people: record.people,
    total: record.total,
    counts: record.counts,
  });
  if (upsertError != null) {
    console.warn('[cloudSync] could not upload scan row', upsertError);
    return false;
  }

  // Nothing to store is a finished job, not a pending one.
  if (thumbnail === '') return true;
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath(userId, record.id, 'thumb'), decode(thumbnail), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (storageError != null) {
    console.warn('[cloudSync] could not upload thumbnail', storageError);
    return false;
  }
  return true;
}

/** Uploads the full-size preview once it exists - see makePreview, it is
 *  encoded after the scan itself already finished saving. */
export async function uploadPreview(
  id: string,
  preview: string,
): Promise<boolean> {
  const userId = await getUserId();
  if (userId == null) return false;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath(userId, id, 'preview'), decode(preview), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error != null) {
    console.warn('[cloudSync] could not upload preview', error);
    return false;
  }
  return true;
}

/**
 * Deletes rows and both possible images for a batch of scans, best effort.
 *
 * Returns whether the rows are gone. A false here queues the ids for retry
 * just like a failed upload does: without it, deleting a scan while offline
 * would leave the cloud row behind, and the next reinstall would restore a
 * scan the user had already thrown away.
 */
export async function deleteScans(ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const userId = await getUserId();
  if (userId == null) return false;

  const { error: rowError } = await supabase
    .from('scans')
    .delete()
    .in('id', ids);
  if (rowError != null) {
    console.warn('[cloudSync] could not delete scan rows', rowError);
    return false;
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
    // The rows are already gone, which is what a restore reads - a leftover
    // image is wasted bytes, not a scan coming back from the dead. Not worth
    // holding the whole batch in the retry queue for.
    console.warn('[cloudSync] could not delete scan images', storageError);
  }
  return true;
}

/**
 * Rebuilds a history from the cloud after a reinstall finds MMKV empty. Only
 * thumbnails come down, not previews - previews stay lazily
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
  return fetchPage(userId, limit, 0);
}

/**
 * A page of scans older than the ones already on screen, for the "show older"
 * button at the foot of the history list.
 *
 * The local history is capped at HISTORY_LIMIT and the cloud table is not, so
 * everything past that cap was already backed up and simply had no way to be
 * read back. This is that way back.
 *
 * Offset paging rather than a `.lt('at', oldest)` cursor: two scans from one
 * batch can land on the same millisecond, and a strictly-older cursor would
 * silently skip the second of the pair. Offsets are only unstable if rows are
 * inserted while paging, and no scan can start while the history sheet is
 * covering the camera - the caller dedupes by id anyway.
 */
export async function fetchOlderScans(
  limit: number,
  offset: number,
): Promise<ScanRecord[]> {
  const userId = await getUserId();
  if (userId == null) return [];
  return fetchPage(userId, limit, offset);
}

/** Rows plus their thumbnails, newest first. Shared by both readers above so
 *  a restored record and a paged-in one are built exactly the same way. */
async function fetchPage(
  userId: string,
  limit: number,
  offset: number,
): Promise<ScanRecord[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('id, at, people, total, counts')
    .eq('user_id', userId)
    .order('at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error != null || data == null) {
    console.warn('[cloudSync] could not read scans', error);
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
