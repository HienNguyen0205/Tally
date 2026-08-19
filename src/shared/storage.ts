import { createMMKV } from 'react-native-mmkv';

/**
 * The app's one on-device key/value store - history, previews, the locale
 * override and settings all share it (see useScanHistory.ts, i18n/index.ts,
 * settings.ts). MMKV is synchronous and mmap-backed rather than a bridge round
 * trip per call, which is the whole reason it replaced
 * @react-native-async-storage/async-storage here. A single instance rather
 * than one per feature keeps every write on the same underlying file instead
 * of opening several.
 *
 * In a Jest environment `createMMKV` auto-detects `JEST_WORKER_ID` and hands
 * back an in-memory mock on its own - no jest.config wiring needed, unlike
 * AsyncStorage before it.
 */
export const storage = createMMKV();

/**
 * Adapts the synchronous store above to the async `getItem`/`setItem`/
 * `removeItem` shape Supabase's `SupportedStorage` interface expects (see
 * shared/supabase.ts) - gotrue always awaits these. MMKV has nothing to
 * actually wait on, so each method just wraps its synchronous result in an
 * already-resolved Promise.
 */
export const asyncStorage = {
  getItem: async (key: string): Promise<string | null> =>
    storage.getString(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    storage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    storage.remove(key);
  },
};
