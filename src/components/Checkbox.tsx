import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO } from '../shared/theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * The check mark, in the same 24-unit grid every Skia icon in icons.tsx is
 * drawn on ('check' there is the identical path: 'M20 6 L9 17 L4 12') - so
 * this is the same glyph, just redrawn as two Views instead of a Skia Path.
 * Both segments land on a plain 45 degrees, which is what makes two straight
 * bars enough to draw it.
 */
const GRID = 24;
const A = { x: 4, y: 12 };
const B = { x: 9, y: 17 };
const C = { x: 20, y: 6 };
const SHORT_LEN = Math.hypot(B.x - A.x, B.y - A.y);
const LONG_LEN = Math.hypot(C.x - B.x, C.y - B.y);
const SHORT_MID = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
const LONG_MID = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
// The glyph's own bounding box centre (4..20, 6..17), not the grid's (0..24)
// - it sits low and right of the grid centre, and centring on the grid would
// look off-centre inside a ring that IS centred.
const CENTER = { x: 12, y: 11.5 };

/**
 * The one selection tick drawn in the app: a hollow ring that fills solid
 * with a check mark when on, both animated. Built from Views, not the Skia
 * <Icon> - every caller here sits inside an RN Modal, where a Skia Canvas
 * draws nothing on Android.
 *
 * The mark used to be the '✓' character in Geist. Geist has no glyph for it,
 * so Android silently substituted the system font for that one character - a
 * hairline tick, a different weight and baseline on every device, sitting
 * inside a vector-perfect ring. Redrawing it from the app's own icon
 * coordinates removes the font entirely: same stroke, same colour, same
 * shape everywhere this renders.
 *
 * Reused everywhere a scan or photo is selected - HistorySheet's rows, its
 * select-all toggle, and PhotoPicker's grid - so the same shape means the
 * same thing everywhere instead of drifting apart, which is what happened
 * before this component existed (the header once drew '☐'/'☑' straight from
 * the system font too).
 */
export function Checkbox({
  selected,
  size = 22,
}: {
  selected: boolean;
  size?: number;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: 200, easing: ease });
  }, [selected, on]);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [COLORS.textMuted, COLORS.accent]),
    backgroundColor: interpolateColor(
      on.value,
      [0, 1],
      ['rgba(0,230,118,0)', COLORS.accent],
    ),
    // A small grow-in rather than popping straight to full size - it reads as
    // the mark settling into place instead of just switching on.
    transform: [{ scale: 0.92 + 0.08 * on.value }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.6 + 0.4 * on.value }],
  }));

  // Maps the 24-unit glyph grid onto this box. 0.72, not 1 - it keeps the
  // mark shy of the ring instead of touching it edge to edge.
  const scale = (size / GRID) * 0.72;
  const stroke = Math.max(1.6, size * 0.1);

  function bar(mid: { x: number; y: number }, len: number, deg: number) {
    const w = len * scale;
    return {
      position: 'absolute' as const,
      width: w,
      height: stroke,
      borderRadius: stroke / 2,
      left: size / 2 + (mid.x - CENTER.x) * scale - w / 2,
      top: size / 2 + (mid.y - CENTER.y) * scale - stroke / 2,
      transform: [{ rotate: `${deg}deg` }],
    };
  }

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2 },
          ringStyle,
        ]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, markStyle]} pointerEvents="none">
        <View style={[styles.mark, bar(SHORT_MID, SHORT_LEN, 45)]} />
        <View style={[styles.mark, bar(LONG_MID, LONG_LEN, -45)]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 1.75 },
  mark: { backgroundColor: '#04120A' },
});
