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
}

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * The count, floating at the top of the screen.
 *
 * It used to carry a second pill with a running total across several captures.
 * That went with the shutter: there are no captures to add up in a live
 * viewfinder, only the number in front of the camera right now.
 */
function ResultIslandInner({ top, faceCount }: Props) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const reveal = useSharedValue(0);
  const stagger = useSharedValue(0);

  // ON MOUNT ONLY. This used to list `faceCount` as a dependency, which meant
  // every change to the number reset the opacity to zero and faded the whole
  // pill back in over 720ms - an announcement, written when a count arrived
  // once per shutter press.
  //
  // A live viewfinder changes the number several times a second, so what the
  // announcement actually produced was a pill blinking out and back, plus a
  // figure that vanished for 140ms each time before fading in behind it. On a
  // screen where nothing else moves, that reads as the app flickering.
  //
  // Measured: sampling the pill's region across a dozen frames swung 18.9 grey
  // levels while the camera behind it moved 0.1. The number changing is its own
  // feedback; it does not need to be announced.
  useEffect(() => {
    reveal.value = withTiming(1, { duration: 720, easing: ease });
    stagger.value = withDelay(
      140,
      withTiming(1, { duration: 720, easing: ease }),
    );
  }, [reveal, stagger]);

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
      </Animated.View>
    </View>
  );
}

/**
 * Memoised for the same reason as the header pill: this is a GlassSurface, and
 * a GlassSurface's core is an Android BlurView. The screen around it re-renders
 * on every detection round, while this only has something new to say when the
 * COUNT changes - which is far rarer than the boxes moving.
 */
export const ResultIsland = React.memo(ResultIslandInner);

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
});
