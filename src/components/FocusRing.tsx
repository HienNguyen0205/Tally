import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO } from '../shared/theme';

const SIZE = 76;
const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * A focus ring that contracts on the tapped point then fades - the feedback that
 * the focus command landed. Keyed by coordinate so every tap makes a fresh ring.
 */
export function FocusRing({ x, y }: { x: number; y: number }) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = 0;
    anim.value = withTiming(1, { duration: 320, easing: ease });
    anim.value = withDelay(900, withTiming(0, { duration: 420, easing: ease }));
  }, [anim]);

  const style = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [{ scale: 1.35 - 0.35 * anim.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { left: x - SIZE / 2, top: y - SIZE / 2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
});
