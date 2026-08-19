import { I18n } from 'i18n-js';

import { vi, type Params, type StringKey } from './vi';
import { en } from './en';

export type Locale = 'vi' | 'en';

/**
 * Vietnamese unless the device asks for something else - this is a Vietnamese
 * app first, and English is the fallback rather than the default.
 *
 * Read once at module load. The device language cannot change without
 * restarting the app (Android's per-app language setting recreates the
 * activity), so re-reading it per render would buy nothing.
 *
 * Intl rather than a native module: `react-native-localize` would read the
 * system locale more thoroughly, but it is a native dependency - a pod install
 * and a rebuild - to answer a question two lines already answer.
 */
function detectLocale(): Locale {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    return tag.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    // Intl is compiled out of some Hermes builds. Falling back to the primary
    // language beats crashing on the first string the app renders.
    return 'vi';
  }
}

export const locale: Locale = detectLocale();

const i18n = new I18n({ vi, en });
i18n.locale = locale;
i18n.defaultLocale = 'vi';
// Belt and braces: `Catalog` already makes a missing translation a build error,
// so this only covers a locale nobody typed against - it resolves to the
// Vietnamese string instead of rendering i18n-js's `[missing ...]` marker.
i18n.enableFallback = true;

/**
 * Look up one string.
 *
 * The signature is the whole point of this wrapper: `key` is checked against
 * the catalog, and the second argument is required exactly when that key
 * interpolates - `t('close')` and `t('zoomTimes', { z: 3 })` both compile,
 * while `t('zoomTimes')`, `t('close', { z: 3 })` and a misspelled key do not.
 * Calling `i18n.t()` directly gives up all three.
 */
export function t<K extends StringKey>(
  key: K,
  ...args: K extends keyof Params ? [Params[K]] : []
): string {
  const [params] = args as [Record<string, unknown>?];
  return i18n.t(key, params);
}
