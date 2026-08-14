import { useCallback } from 'react';
import { Vibration, Platform } from 'react-native';

export function useAlert() {
  return useCallback(() => {
    // Rung theo mẫu: chờ 0ms, rung 200ms, nghỉ 100ms, rung 200ms
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 200, 100, 200]);
    } else {
      Vibration.vibrate();
    }
  }, []);
}
