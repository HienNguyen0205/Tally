import { storage } from './storage';

/**
 * Which scans still owe the cloud a write.
 *
 * Only ids are queued, never copies of the records. The local MMKV history is
 * already the source of truth for what a scan contains, so a queue holding its
 * own copy would be a second thing to keep in step - and would double the
 * storage cost of every thumbnail. Flushing looks each id up in the history it
 * is handed.
 *
 * Two lists rather than one queue of tagged operations: an id can only ever be
 * waiting to upload or waiting to delete, never both, and "is this id pending"
 * is the only question either side asks. Ordering between them does not matter
 * either, because `markDelete` removes the id from the upload list outright -
 * there is no way to end up deleting something this queue is still trying to
 * create.
 */
const UPLOAD_KEY = 'tally.pending.upload.v1';
const DELETE_KEY = 'tally.pending.delete.v1';

/** Tolerates anything, the same way parseHistory does - a corrupt queue must
 *  degrade to "nothing pending" rather than throw on launch. */
function read(key: string): string[] {
  try {
    const raw = storage.getString(key);
    if (raw == null || raw === '') return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function write(key: string, ids: readonly string[]): void {
  try {
    if (ids.length === 0) storage.remove(key);
    else storage.set(key, JSON.stringify(ids));
  } catch (e) {
    console.warn('[pendingSync] could not save the queue', e);
  }
}

export function pendingUploads(): string[] {
  return read(UPLOAD_KEY);
}

export function pendingDeletes(): string[] {
  return read(DELETE_KEY);
}

/**
 * Marked *before* the upload is attempted, not after it fails: the app can be
 * killed mid-request, and a scan that was never recorded as pending would
 * never be retried.
 */
export function markUpload(id: string): void {
  const ids = read(UPLOAD_KEY);
  if (ids.includes(id)) return;
  write(UPLOAD_KEY, [...ids, id]);
}

export function clearUpload(id: string): void {
  const ids = read(UPLOAD_KEY);
  if (!ids.includes(id)) return;
  write(
    UPLOAD_KEY,
    ids.filter(v => v !== id),
  );
}

/**
 * A scan deleted locally must not stay queued for upload, or the flush would
 * recreate in the cloud exactly what the user just removed. Queuing the
 * delete regardless of whether the upload ever landed is safe: deleting rows
 * and objects that were never written is a no-op, as cloudSync already notes.
 */
export function markDelete(id: string): void {
  clearUpload(id);
  const ids = read(DELETE_KEY);
  if (ids.includes(id)) return;
  write(DELETE_KEY, [...ids, id]);
}

export function clearDeletes(done: readonly string[]): void {
  const drop = new Set(done);
  const ids = read(DELETE_KEY);
  const next = ids.filter(v => !drop.has(v));
  if (next.length === ids.length) return;
  write(DELETE_KEY, next);
}

/** Signing out or clearing history leaves nothing worth retrying. */
export function clearAllPending(): void {
  write(UPLOAD_KEY, []);
  write(DELETE_KEY, []);
}
