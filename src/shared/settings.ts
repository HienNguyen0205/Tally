import { storage } from './storage';
import { SCORE_THRESHOLD } from './constants';

export interface Settings {
  hapticsEnabled: boolean;
  defaultThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hapticsEnabled: true,
  defaultThreshold: SCORE_THRESHOLD,
};

const KEY = 'tally.settings.v1';

function isSettings(v: unknown): v is Settings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.hapticsEnabled === 'boolean' && typeof s.defaultThreshold === 'number'
  );
}

/**
 * Reads saved preferences, tolerating anything - same reasoning as
 * `parseHistory` in shared/history.ts: storage outlives the code that wrote
 * it, so a half-written value or a shape from an older build degrades to the
 * defaults rather than throwing on the first render after an update.
 *
 * Synchronous, because MMKV is: useSettings reads this straight into a
 * `useState` initialiser rather than loading it after mount, so
 * DetectorScreen never renders a frame with the wrong defaultThreshold and
 * App.tsx never needs to gate on a "settings loaded yet" flag.
 */
export function loadSettings(): Settings {
  try {
    const raw = storage.getString(KEY);
    if (raw == null) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  storage.set(KEY, JSON.stringify(settings));
}
