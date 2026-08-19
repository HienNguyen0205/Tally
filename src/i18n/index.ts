import { useEffect, useState } from 'react';
import { I18n } from 'i18n-js';

import { storage } from '../shared/storage';
import { vi, type Params, type StringKey } from './vi';
import { en } from './en';

export type Locale = 'vi' | 'en';

const OVERRIDE_KEY = 'tally.locale.override';

/**
 * Vietnamese unless the device asks for something else - this is a Vietnamese
 * app first, and English is the fallback rather than the default.
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

// `let`, not `const`: setLocale() below reassigns this binding directly, and
// every other module imports it live (`import { locale } from '../i18n'`) - ES
// module bindings are live references, so labels.ts and everyone else sees the
// new value immediately, with no extra plumbing.
export let locale: Locale = detectLocale();

const i18n = new I18n({ vi, en });
i18n.locale = locale;
i18n.defaultLocale = 'vi';
// Belt and braces: `InflectedCatalog` already makes a missing translation a
// build error, so this only covers a locale nobody typed against - it resolves
// to the Vietnamese string instead of rendering i18n-js's `[missing ...]`
// marker.
i18n.enableFallback = true;

// A locale saved in Settings overrides the detected one, applied synchronously
// before anything ever renders. MMKV reads are synchronous - unlike the old
// AsyncStorage-backed version, there is no window where the wrong language
// could flash on screen for a returning user, and so nothing here needs an
// App.tsx loading gate the way settings.ts below briefly did.
try {
  const stored = storage.getString(OVERRIDE_KEY);
  if (stored === 'vi' || stored === 'en') {
    locale = stored;
    i18n.locale = stored;
  }
} catch (e) {
  console.warn('[i18n] could not read the saved locale preference', e);
}

const listeners = new Set<() => void>();

/** Persists the choice and switches every `t()` call immediately. */
export function setLocale(l: Locale): void {
  locale = l;
  i18n.locale = l;
  listeners.forEach(fn => fn());
  try {
    storage.set(OVERRIDE_KEY, l);
  } catch (e) {
    console.warn('[i18n] could not save locale preference', e);
  }
}

/**
 * Subscribes the calling component to locale changes.
 *
 * `setLocale` never triggers a React re-render on its own - `t()` is a plain
 * function, not a hook, and `locale` is a module-level binding React knows
 * nothing about. Calling this hook once, high enough in the tree (App.tsx's
 * `Root`), forces a re-render there whenever the locale changes; since nothing
 * in this codebase memoises with `React.memo`, that re-render cascades to
 * every descendant, and each one's `t()` calls read the new locale on their
 * next pass. No remount, no context provider, no prop threading.
 */
export function useLocale(): Locale {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(x => x + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return locale;
}

/**
 * Look up one string.
 *
 * The signature is the whole point of this wrapper: `key` is checked against
 * the catalog, and the second argument is required exactly when that key
 * interpolates - `t('close')` and `t('zoomTimes', { count: 3 })` both compile,
 * while `t('zoomTimes')`, `t('close', { count: 3 })` and a misspelled key do
 * not. Calling `i18n.t()` directly gives up all three.
 */
export function t<K extends StringKey>(
  key: K,
  ...args: K extends keyof Params ? [Params[K]] : []
): string {
  const [params] = args as [Record<string, unknown>?];
  return i18n.t(key, params);
}
