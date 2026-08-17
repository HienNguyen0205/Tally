import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { addRecord, parseHistory, type ScanRecord } from '../shared/history';

// Versioned so a future shape change can start clean instead of migrating
// records whose only value is that they are recent.
const KEY = 'tally.history.v1';

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
    current.current = next;
    setRecords(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(e =>
      console.warn('[useScanHistory] could not save history', e),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(KEY)
      .then(raw => {
        if (cancelled) return;
        const stored = parseHistory(raw);
        current.current = stored;
        setRecords(stored);
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
    (record: ScanRecord) => commit(addRecord(current.current, record)),
    [commit],
  );

  const remove = useCallback(
    (id: string) => commit(current.current.filter(r => r.id !== id)),
    [commit],
  );

  const clear = useCallback(() => commit([]), [commit]);

  return { records, loaded, add, remove, clear };
}
