import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  deleteScans,
  downloadPreview,
  restoreFromCloud,
  uploadPreview,
  uploadScan,
} from '../shared/cloudSync';
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
 * @react-native-async-storage/async-storage is SQLite-backed with no fixed
 * per-app quota - the "6MB AsyncStorage default" once assumed here belonged
 * to React Native's old built-in AsyncStorage, not this package.
 */
const previewKey = (id: string) => `tally.preview.${id}`;

/**
 * Past scans, newest first, surviving app restarts.
 *
 * The next list is computed from a ref rather than inside a state updater:
 * `add` is called from a scan callback that can hold a stale closure, and
 * writing to storage inside an updater would fire twice under StrictMode.
 */
export function useScanHistory() {
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

    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(e =>
      console.warn('[useScanHistory] could not save history', e),
    );
    if (orphans.length > 0) {
      // removeMany, not the old multiRemove - this version of the library
      // moved to the Web Storage-shaped API.
      AsyncStorage.removeMany(orphans).catch(e =>
        console.warn('[useScanHistory] could not drop old previews', e),
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(KEY)
      .then(async raw => {
        if (cancelled) return;
        const stored = parseHistory(raw);

        // Empty local storage with a non-empty cloud history means this is a
        // reinstall or a new device, not someone with a genuinely blank
        // history - restore instead of starting over. A non-empty local list
        // is left alone: it is already the fast path, and hitting the network
        // on every ordinary launch would make the app wait on a signal it has
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
        AsyncStorage.setItem(KEY, JSON.stringify(restored)).catch(e =>
          console.warn('[useScanHistory] could not cache restored history', e),
        );
      })
      // Unreadable storage is not worth an alert - the app works fine without
      // history, it just starts empty.
      .catch(e => console.warn('[useScanHistory] could not read history', e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const add = useCallback(
    (record: ScanRecord) => {
      commit(addRecord(current.current, record));
      uploadScan(record, record.thumbnail).catch(e =>
        console.warn('[useScanHistory] could not upload scan', e),
      );
    },
    [commit],
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
      const drop = new Set(ids);
      commit(current.current.filter(r => !drop.has(r.id)));
      deleteScans(ids).catch(e =>
        console.warn('[useScanHistory] could not delete cloud scans', e),
      );
    },
    [commit],
  );

  /** Local-only write, used both by addPreview and by loadPreview's cloud
   *  fallback - the fallback must NOT go through addPreview, or a preview
   *  just downloaded from Supabase would immediately be uploaded right back. */
  const cacheLocally = useCallback((id: string, data: string) => {
    AsyncStorage.setItem(previewKey(id), data).catch(e =>
      console.warn('[useScanHistory] could not save preview', e),
    );
  }, []);

  /** Stores the full-size preview for a scan, locally and in the cloud. Fire
   *  and forget both ways - a record without one still opens, it just has
   *  nothing to show. */
  const addPreview = useCallback(
    (id: string, data: string) => {
      cacheLocally(id, data);
      uploadPreview(id, data).catch(e =>
        console.warn('[useScanHistory] could not upload preview', e),
      );
    },
    [cacheLocally],
  );

  /**
   * Null for a scan saved before previews existed, or if both the local cache
   * and the cloud fall through. A restored history has records with no local
   * preview at all - that miss falls through to Supabase, and a hit is
   * written back to AsyncStorage so opening the same scan twice only ever
   * pays for the network once.
   */
  const loadPreview = useCallback(
    async (id: string) => {
      const cached = await AsyncStorage.getItem(previewKey(id)).catch(e => {
        console.warn('[useScanHistory] could not read preview', e);
        return null;
      });
      if (cached != null) return cached;

      const remote = await downloadPreview(id);
      if (remote != null) cacheLocally(id, remote);
      return remote;
    },
    [cacheLocally],
  );

  return { records, loaded, add, removeMany, addPreview, loadPreview };
}
