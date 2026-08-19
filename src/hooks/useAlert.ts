import { useCallback } from 'react';
import { Vibration, Platform } from 'react-native';

/** @param enabled The Settings screen's haptics toggle - false silences it. */
export function useAlert(enabled: boolean) {
  return useCallback(() => {
    if (!enabled) return;
    // Pattern: wait 0ms, buzz 200ms, pause 100ms, buzz 200ms
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 200, 100, 200]);
    } else {
      Vibration.vibrate();
    }
  }, [enabled]);
}
