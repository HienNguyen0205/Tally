import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { t } from '../i18n';
import { Icon } from './icons';

const TRACK_W = 104;
const KNOB = 18;
const MIN = 0.2;
const MAX = 0.9;
const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  value: number;
  onChange: (v: number) => void;
  /**
   * The leading target icon is Skia - blank inside an RN `Modal` on Android
   * (see modalIcons.tsx). SettingsScreen renders this inside one, so it opts
   * out rather than shipping an invisible icon that still eats layout space.
   */
  showIcon?: boolean;
}

/**
 * Confidence threshold slider - dragged directly rather than cycled by tapping.
 *
 * Uses RN core's PanResponder (the project has no gesture-handler). The gesture
 * runs on the JS thread but only writes a shared value; Reanimated does the
 * drawing on the UI thread, so it stays smooth.
 */
/** Threshold (0.2..0.9) -> position along the track (0..1). */
function toProgress(value: number): number {
  return (value - MIN) / (MAX - MIN);
}

export function ThresholdSlider({ value, onChange, showIcon = true }: Props) {
  const travel = TRACK_W - KNOB;
  const progress = useSharedValue(toProgress(value));
  // The value at drag start, so finger travel accumulates onto it. Derived from
  // the prop rather than read off progress.value: a useRef argument evaluates on
  // every render, and reading a shared value mid-render is exactly what
  // Reanimated warns about.
  const startProgress = useRef(toProgress(value));
  const grabbed = useSharedValue(0);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startProgress.current = progress.value;
          grabbed.value = withTiming(1, { duration: 160, easing: ease });
        },
        onPanResponderMove: (_, g) => {
          const next = clamp(startProgress.current + g.dx / travel);
          progress.value = next;
          // Round to 1% so React state is not pushed on every pixel.
          onChange(Math.round((MIN + next * (MAX - MIN)) * 100) / 100);
        },
        onPanResponderRelease: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
        },
        onPanResponderTerminate: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
        },
      }),
    [grabbed, progress, travel, onChange],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * travel },
      { scale: 1 + 0.25 * grabbed.value },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  // A drag is unusable with a screen reader on. Declaring the row adjustable
  // gives it the standard swipe-up/down gestures, and the actions below map
  // those onto the same 5% steps a sighted user gets from small drags.
  const step = useCallback(
    (delta: number) => {
      const next = clamp(toProgress(value) + delta);
      progress.value = withTiming(next, { duration: 120, easing: ease });
      onChange(Math.round((MIN + next * (MAX - MIN)) * 100) / 100);
    },
    [value, progress, onChange],
  );

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('thresholdLabel')}
      accessibilityHint={t('thresholdHint')}
      accessibilityValue={{
        min: Math.round(MIN * 100),
        max: Math.round(MAX * 100),
        now: Math.round(value * 100),
        text: t('percent', { n: Math.round(value * 100) }),
      }}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'increment') step(0.05);
        if (e.nativeEvent.actionName === 'decrement') step(-0.05);
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      {...pan.panHandlers}
    >
      {showIcon && (
        <Icon name="target" size={15} color={COLORS.textMuted} strokeWidth={1.5} />
      )}

      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.knob, knobStyle]} />
      </View>

      <Text style={styles.value}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  track: {
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    // Scale from the left edge rather than the centre.
    transformOrigin: 'left',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fff',
  },
  value: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
    minWidth: 34,
    textAlign: 'right',
  },
});
