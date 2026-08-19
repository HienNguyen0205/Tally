import { useCallback, useState } from 'react';

import { loadSettings, saveSettings, type Settings } from '../shared/settings';

/**
 * Persisted preferences: the haptic alert toggle and the confidence threshold
 * DetectorScreen starts a session with.
 *
 * `loadSettings()` reads MMKV synchronously, so it runs directly in the
 * `useState` initialiser - there is no "not loaded yet" moment for App.tsx to
 * gate on, and DetectorScreen's initial threshold is always the real saved
 * default rather than a placeholder that then jumps.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try {
        saveSettings(next);
      } catch (e) {
        console.warn('[useSettings] could not save settings', e);
      }
      return next;
    });
  }, []);

  return { ...settings, update };
}
