import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { GlassSurface } from './GlassSurface';

interface Props {
  peopleCount: number;
  objectCount: number;
}

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * The result island floating at the top of the screen. Mounted only once there
 * is a result - before a scan there is nothing to say, and the viewfinder
 * deserves the space more than a hint line does.
 */
export function ResultIsland({ peopleCount, objectCount }: Props) {
  const { width, height } = useWindowDimensions();
  // Landscape: shift left to clear the shutter, which has moved to the right.
  const landscape = width > height;

  const reveal = useSharedValue(0);
  const stagger = useSharedValue(0);

  useEffect(() => {
    reveal.value = 0;
    stagger.value = 0;
    reveal.value = withTiming(1, { duration: 720, easing: ease });
    stagger.value = withDelay(
      140,
      withTiming(1, { duration: 720, easing: ease }),
    );
  }, [peopleCount, objectCount, reveal, stagger]);

  // Animate transform/opacity only - leave width/height alone to avoid reflow.
  const shellStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: -18 * (1 - reveal.value) },
      { scale: 0.96 + 0.04 * reveal.value },
    ],
  }));

  const staggerStyle = useAnimatedStyle(() => ({
    opacity: stagger.value,
    transform: [{ translateY: 12 * (1 - stagger.value) }],
  }));

  const present = peopleCount > 0;

  return (
    <View
      style={[styles.anchor, landscape && styles.anchorLandscape]}
      pointerEvents="none"
    >
      <Animated.View style={shellStyle}>
        <GlassSurface pill contentStyle={styles.corePill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: present ? COLORS.accent : COLORS.textFaint },
            ]}
          />
          <Text style={styles.count}>{peopleCount}</Text>
          <Text style={styles.unit}>người</Text>

          <Animated.View style={[styles.tail, staggerStyle]}>
            <View style={styles.dividerV} />
            <Text style={styles.objects}>{objectCount}</Text>
            <Text style={styles.unit}>vật thể</Text>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  anchorLandscape: {
    top: 28,
    left: 28,
    right: undefined,
    alignItems: 'flex-start',
  },
  // A single row - review mode has to give the image its space.
  corePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },

  statusDot: { width: 7, height: 7, borderRadius: 3.5 },

  count: {
    color: COLORS.textPrimary,
    fontFamily: FONT.bold,
    fontSize: 19,
    letterSpacing: -0.4,
  },
  objects: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 15,
  },
  unit: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 12,
  },

  tail: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dividerV: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: COLORS.hairline,
    marginRight: 1,
  },
});
