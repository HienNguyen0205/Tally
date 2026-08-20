import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { storage } from '../shared/storage';
import {
  deleteScans,
  downloadPreview,
  restoreFromCloud,
  uploadPreview,
  uploadScan,
} from '../shared/cloudSync';
import {
  clearDeletes,
  clearUpload,
  markDelete,
  markUpload,
  pendingDeletes,
  pendingUploads,
} from '../shared/pendingSync';
import {
  addRecord,
  HISTORY_LIMIT,
  parseHistory,
  type ScanRecord,
} from '../shared/history';

// Versioned so a future shape change can start clean instead of migrating
// records whose only value is that they are recent.
const KEY = 'tally.history.v1';

/**
 * Previews live one per key, outside the history list.
 *
 * A preview runs well over 100KB against a row's ~4KB thumbnail (see
 * makePreview in shared/thumbnail.ts for why), so folding fifty of them into
 * the list would mean parsing several MB of JSON on every launch to render a
 * screen that only shows thumbnails. Separate keys keep the list load cheap
 * and let a preview be read only when a row is opened.
 *
 * MMKV has no fixed per-app quota the way React Native's old built-in
 * AsyncStorage once did (a 6MB default some comments here used to worry
 * about) - it just mmaps a file and grows it.
 */
const previewKey = (id: string) => `tally.preview.${id}`;

/**
 * Past scans, newest first, surviving app restarts.
 *
 * The next list is computed from a ref rather than inside a state updater:
 * `add` is called from a scan callback that can hold a stale closure, and
 * writing to storage inside an updater would fire twice under StrictMode.
 *
 * `guest` disables every write, local and cloud alike - a session-less user
 * (see AuthScreen's "continue without an account") gets a working camera and
 * a history sheet that simply never fills, rather than history quietly
 * piling up in MMKV under an identity Supabase never sees, orphaned the
 * moment they do create an account. The hook still runs unconditionally
 * (rules of hooks), each write just checks `guest` first.
 */
export function useScanHistory(guest: boolean) {
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const current = useRef<ScanRecord[]>([]);

  const commit = useCallback((next: ScanRecord[]) => {
    // Whatever left the list takes its preview with it - dropped off the end by
    // HISTORY_LIMIT, deleted by hand, or cleared. Orphaned preview keys would
    // otherwise pile up forever with nothing left pointing at them.
    const kept = new Set(next.map(r => r.id));
    const orphans = current.current
      .filter(r => !kept.has(r.id))
      .map(r => previewKey(r.id));

    current.current = next;
    setRecords(next);

    try {
      storage.set(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('[useScanHistory] could not save history', e);
    }
    // No removeMany on MMKV - remove() is one key at a time, but it is a
    // synchronous mmap write rather than a bridge call, so looping costs
    // nothing like it would have over AsyncStorage's old multiRemove.
    for (const key of orphans) {
      try {
        storage.remove(key);
      } catch (e) {
        console.warn('[useScanHistory] could not drop an old preview', e);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A guest has no MMKV history to read and no session for restoreFromCloud
    // to key off - records simply stays [] for the life of the session.
    if (guest) {
      setLoaded(true);
      return;
    }

    (async () => {
      // The read itself is synchronous (MMKV), but the whole effect body stays
      // async because the cloud-restore fallback below is a real network call.
      let stored: ScanRecord[] = [];
      try {
        stored = parseHistory(storage.getString(KEY) ?? null);
      } catch (e) {
        // Unreadable storage is not worth an alert - the app works fine
        // without history, it just starts empty.
        console.warn('[useScanHistory] could not read history', e);
      }
      if (cancelled) return;

      // Empty local storage with a non-empty cloud history means this is a
      // reinstall or a new device, not someone with a genuinely blank
      // history - restore instead of starting over. A non-empty local list is
      // left alone: it is already the fast path, and hitting the network on
      // every ordinary launch would make the app wait on a signal it has
      // never needed before.
      if (stored.length > 0) {
        current.current = stored;
        setRecords(stored);
        return;
      }

      const restored = await restoreFromCloud(HISTORY_LIMIT);
      if (cancelled || restored.length === 0) return;
      current.current = restored;
      setRecords(restored);
      try {
        storage.set(KEY, JSON.stringify(restored));
      } catch (e) {
        console.warn('[useScanHistory] could not cache restored history', e);
      }
    })().finally(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [guest]);

  const add = useCallback(
    (record: ScanRecord) => {
      if (guest) return;
      commit(addRecord(current.current, record));

      // Queued before the attempt, not after it fails: the upload is a real
      // network round trip and the app can be backgrounded or killed part way
      // through it, which would leave a scan neither uploaded nor pending.
      markUpload(record.id);
      uploadScan(record, record.thumbnail)
        .then(done => {
          if (done) clearUpload(record.id);
        })
        .catch(e => console.warn('[useScanHistory] could not upload scan', e));
    },
    [commit, guest],
  );

  /**
   * One commit for a whole selection - deleting eight rows one call at a time
   * would rewrite the list and hit storage eight times. A single row is just
   * a selection of one, so there is no second path to keep in step.
   *
   * Cloud deletion only follows an explicit remove, never HISTORY_LIMIT
   * quietly evicting an old row off the local list - the cloud copy is a
   * backup of everything scanned, not a mirror of the last 50.
   */
  const removeMany = useCallback(
    (ids: readonly string[]) => {
      if (guest) return;
      const drop = new Set(ids);
      commit(current.current.filter(r => !drop.has(r.id)));

      // markDelete also drops each id from the upload queue, so a scan removed
      // before its upload ever landed is not recreated in the cloud by the
      // next flush.
      for (const id of ids) markDelete(id);
      deleteScans(ids)
        .then(done => {
          if (done) clearDeletes(ids);
        })
        .catch(e =>
          console.warn('[useScanHistory] could not delete cloud scans', e),
        );
    },
    [commit, guest],
  );

  /** Local-only write, used both by addPreview and by loadPreview's cloud
   *  fallback - the fallback must NOT go through addPreview, or a preview
   *  just downloaded from Supabase would immediately be uploaded right back. */
  const cacheLocally = useCallback((id: string, data: string) => {
    try {
      storage.set(previewKey(id), data);
    } catch (e) {
      console.warn('[useScanHistory] could not save preview', e);
    }
  }, []);

  /**
   * Retries everything the cloud never received.
   *
   * Runs on mount and whenever the app comes back to the foreground - the
   * common case is scanning with no signal, pocketing the phone, and getting
   * a connection back without ever restarting the app, which a mount-only
   * flush would miss for days.
   *
   * Each id is looked up in the local history rather than in a queued copy of
   * the record. An id with no record left is dropped: the only way that
   * happens is HISTORY_LIMIT evicting it, and the cloud is a backup of what
   * the phone still holds, not an archive of what it has forgotten.
   */
  const flush = useCallback(async () => {
    if (guest) return;

    const deletes = pendingDeletes();
    if (deletes.length > 0 && (await deleteScans(deletes))) {
      clearDeletes(deletes);
    }

    for (const id of pendingUploads()) {
      const record = current.current.find(r => r.id === id);
      if (record == null) {
        clearUpload(id);
        continue;
      }

      if (!(await uploadScan(record, record.thumbnail))) continue;

      // The preview is optional and lives outside the record, so a scan with
      // none is still fully uploaded. Only a preview that exists locally and
      // fails to land keeps the id queued.
      const preview = storage.getString(previewKey(id));
      if (preview != null && !(await uploadPreview(id, preview))) continue;

      clearUpload(id);
    }
  }, [guest]);

  // Gated on `loaded`, because flush looks each pending id up in
  // `current.current` - running before the history is read would find nothing
  // and drop every queued id as evicted.
  useEffect(() => {
    if (!loaded || guest) return;

    const run = () => {
      flush().catch(e =>
        console.warn('[useScanHistory] could not flush the sync queue', e),
      );
    };
    run();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [loaded, guest, flush]);

  /** Stores the full-size preview for a scan, locally and in the cloud. Fire
   *  and forget both ways - a record without one still opens, it just has
   *  nothing to show. */
  const addPreview = useCallback(
    (id: string, data: string) => {
      if (guest) return;
      cacheLocally(id, data);
      uploadPreview(id, data)
        .then(done => {
          // Re-queues the whole scan rather than the preview alone: flush
          // re-sends both, and both upsert, so one queue entry covers either
          // half going missing.
          if (!done) markUpload(id);
        })
        .catch(e => {
          console.warn('[useScanHistory] could not upload preview', e);
          markUpload(id);
        });
    },
    [cacheLocally, guest],
  );

  /**
   * Null for a scan saved before previews existed, or if both the local cache
   * and the cloud fall through. A restored history has records with no local
   * preview at all - that miss falls through to Supabase, and a hit is
   * written back to MMKV so opening the same scan twice only ever pays for
   * the network once.
   */
  const loadPreview = useCallback(
    async (id: string) => {
      // Unreachable in practice - a guest's `records` is always [], so there
      // is never a row to open a preview for - but guarded anyway rather than
      // relying on that.
      if (guest) return null;

      let cached: string | null = null;
      try {
        cached = storage.getString(previewKey(id)) ?? null;
      } catch (e) {
        console.warn('[useScanHistory] could not read preview', e);
      }
      if (cached != null) return cached;

      const remote = await downloadPreview(id);
      if (remote != null) cacheLocally(id, remote);
      return remote;
    },
    [cacheLocally, guest],
  );

  return { records, loaded, add, removeMany, addPreview, loadPreview };
}
