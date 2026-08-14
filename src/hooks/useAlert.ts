import { useCallback } from 'react';
import { Vibration, Platform } from 'react-native';

export function useAlert() {
  return useCallback(() => {
    // Pattern: wait 0ms, buzz 200ms, pause 100ms, buzz 200ms
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 200, 100, 200]);
    } else {
      Vibration.vibrate();
    }
  }, []);
}
