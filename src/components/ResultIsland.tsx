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
import { t } from '../i18n';
import { GlassSurface } from './GlassSurface';

interface Props {
  /** Screen-space top offset, in px - DetectorScreen computes this from the
   *  safe area inset plus the header pill above, so the two never overlap. */
  top: number;
  faceCount: number;
  /** Running total while captures are being added up; null when off. */
  session?: { faces: number; photos: number } | null;
}

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * The result island floating at the top of the screen. Mounted only once there
 * is a result - before a scan there is nothing to say, and the viewfinder
 * deserves the space more than a hint line does.
 */
export function ResultIsland({ top, faceCount, session = null }: Props) {
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
  }, [faceCount, reveal, stagger]);

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

  const present = faceCount > 0;

  return (
    <View
      style={[styles.anchor, landscape && styles.anchorLandscape, { top }]}
      pointerEvents="none"
    >
      <Animated.View style={[shellStyle, styles.stack]}>
        <GlassSurface pill contentStyle={styles.corePill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: present ? COLORS.accent : COLORS.textFaint },
            ]}
          />
          {/* One figure, not two. The second block used to carry the object
              total beside the person count; a single-class detector makes
              those the same number, and showing it twice reads as a bug. */}
          <Animated.View style={[styles.tail, staggerStyle]}>
            <Text style={styles.count}>{faceCount}</Text>
          </Animated.View>
          <Text style={styles.unit}>{t('faceName', { count: faceCount })}</Text>
        </GlassSurface>

        {/* The running total gets its own pill rather than another row inside
            the first: the top line is what this shot found, and merging the two
            makes it ambiguous which number the big one is. */}
        {session != null && (
          <GlassSurface pill contentStyle={styles.sumPill}>
            <Text style={styles.sumLabel}>{t('sumTotal')}</Text>
            <Text style={styles.sumCount}>{session.faces}</Text>
            <Text style={styles.unit}>{t('faceName', { count: session.faces })}</Text>
            <View style={styles.dividerV} />
            <Text style={styles.unit}>
              {t('sumPhotos', { count: session.photos })}
            </Text>
          </GlassSurface>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Both pills centre on each other in portrait and left-align in landscape,
  // matching whatever the anchor above decided.
  stack: { alignItems: 'center' },
  anchorLandscape: {
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

  sumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  sumLabel: {
    color: COLORS.accent,
    fontFamily: FONT.semibold,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sumCount: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 14,
  },

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
