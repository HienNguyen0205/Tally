import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { t } from '../i18n';
import { GlassSurface } from './GlassSurface';

const SWEEP_MS = 1100;
const GLOW_H = 120;
const ease = Easing.bezier(...EASE_OUT_EXPO);

function Corner({ style }: { style: object }) {
  return (
    <View style={[styles.corner, style]}>
      <View style={styles.cornerH} />
      <View style={styles.cornerV} />
    </View>
  );
}

/**
 * The scanning overlay: four corner brackets springing open plus a line sweeping
 * down. Transform/opacity only, so it runs on the GPU and causes no reflow.
 */
export function ScanOverlay({ label }: { label?: string }) {
  const { width, height } = useWindowDimensions();
  // Sized off the short edge: a fixed % squashes flat in landscape.
  const inset = Math.round(Math.min(width, height) * 0.11);

  const sweep = useSharedValue(0);
  const frame = useSharedValue(0);

  useEffect(() => {
    frame.value = 0;
    frame.value = withTiming(1, { duration: 620, easing: ease });

    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [sweep, frame]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (height + GLOW_H) }],
    // Fade at both ends of the travel so the line does not get cut off at the
    // screen edge.
    opacity: Math.sin(sweep.value * Math.PI) * 0.9 + 0.1,
  }));

  const frameStyle = useAnimatedStyle(() => ({
    opacity: frame.value,
    transform: [{ scale: 1.04 - 0.04 * frame.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: frame.value,
    transform: [{ translateY: 14 * (1 - frame.value) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.frame,
          { top: inset, bottom: inset, left: inset, right: inset },
          frameStyle,
        ]}
      >
        <Corner style={styles.tl} />
        <Corner style={styles.tr} />
        <Corner style={styles.bl} />
        <Corner style={styles.br} />
      </Animated.View>

      <Animated.View style={[styles.sweep, sweepStyle]}>
        <View style={styles.glow} />
        <View style={styles.line} />
      </Animated.View>

      <Animated.View style={[styles.labelAnchor, labelStyle]}>
        <GlassSurface pill contentStyle={styles.labelCore}>
          <View style={styles.pulse} />
          <Text style={styles.label}>{label ?? t('scanning')}</Text>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const CORNER = 34;
const THICK = 2;

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerH: {
    position: 'absolute',
    height: THICK,
    width: CORNER,
    backgroundColor: COLORS.accent,
    borderRadius: THICK,
  },
  cornerV: {
    position: 'absolute',
    width: THICK,
    height: CORNER,
    backgroundColor: COLORS.accent,
    borderRadius: THICK,
  },
  tl: { top: 0, left: 0 },
  tr: { top: 0, right: 0, transform: [{ scaleX: -1 }] },
  bl: { bottom: 0, left: 0, transform: [{ scaleY: -1 }] },
  br: { bottom: 0, right: 0, transform: [{ scaleX: -1 }, { scaleY: -1 }] },

  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -GLOW_H,
    height: GLOW_H,
    justifyContent: 'flex-end',
  },
  glow: { flex: 1, backgroundColor: 'rgba(0,230,118,0.13)' },
  line: { height: 1.5, backgroundColor: COLORS.accent },

  labelAnchor: {
    position: 'absolute',
    bottom: '24%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  labelCore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  label: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 10,
    letterSpacing: 2.4,
  },
});
