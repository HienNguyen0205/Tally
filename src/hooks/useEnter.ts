import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '../shared/theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Fade-and-lift into place, `delay` ms after mount.
 *
 * Give each block on a screen a different delay and the screen assembles
 * itself instead of appearing whole - the beat LaunchScreen hands over on.
 * The returned style is meant for an `Animated.View` wrapping the block.
 */
export function useEnter(delay: number) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 760, easing: ease }));
  }, [v, delay]);

  return useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: 20 * (1 - v.value) }],
  }));
}
