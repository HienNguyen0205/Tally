import React, { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../shared/theme';
import { t } from '../shared/strings';

const ITEM_W = 52;
const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  steps: number[];
  value: number;
  onChange: (v: number) => void;
}

/**
 * Zoom step picker: tap to jump, or drag sideways to sweep through the steps.
 * The backing indicator slides with momentum instead of snapping colour.
 */
export function ZoomSelector({ steps, value, onChange }: Props) {
  const index = Math.max(0, steps.indexOf(value));
  const pos = useSharedValue(index);
  const startIndex = useRef(index);
  const dragging = useRef(false);

  // Sync when the value changes from outside (e.g. reset to 1x). In an effect
  // rather than mid-render, and skipped mid-drag so the two do not fight.
  useEffect(() => {
    if (dragging.current) return;
    pos.value = withTiming(index, { duration: 420, easing: ease });
  }, [index, pos]);

  const moveTo = (i: number) => {
    const clamped = Math.min(steps.length - 1, Math.max(0, i));
    startIndex.current = clamped;
    pos.value = withTiming(clamped, { duration: 420, easing: ease });
    const next = steps[clamped];
    if (next != null && next !== value) onChange(next);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim the gesture only on a real horizontal drag, so taps still reach
        // the buttons.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6,
        onPanResponderGrant: () => {
          dragging.current = true;
          startIndex.current = Math.round(pos.value);
        },
        onPanResponderMove: (_, g) => {
          const raw = startIndex.current + g.dx / ITEM_W;
          pos.value = Math.min(steps.length - 1, Math.max(0, raw));
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          // On release, snap to the nearest step.
          moveTo(Math.round(pos.value));
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          moveTo(Math.round(pos.value));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, value, onChange],
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * ITEM_W }],
  }));

  return (
    <View style={styles.row} {...pan.panHandlers}>
      <Animated.View style={[styles.pill, pillStyle]} />

      {steps.map((z, i) => (
        <Pressable
          key={z}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel={t.zoomTimes(z)}
          accessibilityState={{ selected: z === value }}
          onPress={() => moveTo(i)}
        >
          <ZoomLabel active={z === value}>{`${z}×`}</ZoomLabel>
        </Pressable>
      ))}
    </View>
  );
}

/** Label that eases between state colours rather than jumping. */
function ZoomLabel({
  children,
  active,
}: {
  children: string;
  active: boolean;
}) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 320, easing: ease });
  }, [active, on]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * on.value,
    transform: [{ scale: 0.94 + 0.06 * on.value }],
  }));

  return (
    <Animated.Text style={[styles.label, active && styles.labelActive, style]}>
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    position: 'absolute',
    width: ITEM_W,
    height: 34,
    borderRadius: RADIUS.pillShell,
    backgroundColor: COLORS.accent,
  },
  item: {
    width: ITEM_W,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  labelActive: { color: '#04120A', fontFamily: FONT.semibold },
});
