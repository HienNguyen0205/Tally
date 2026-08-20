import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { label } from '../shared/labels';
import { t } from '../i18n';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Detail sheet for one detection: what it is, and how sure the model is.
 *
 * A single row of three blocks: name - score pill - close. The score sits in a
 * tinted pill rather than a label+number column, so it reads both as the figure
 * and as the thread tying this sheet to the box just tapped.
 *
 * The subline used to carry a finer name from a second, ImageNet classifier -
 * "boat" became "gondola". That model went with the switch to a face detector:
 * ImageNet has no person class at all, so refining a face crop could only ever
 * return a garment or a backdrop.
 */
export function DetailSheet({
  classId,
  score,
  onClose,
}: {
  classId: number;
  score: number;
  onClose: () => void;
}) {
  const reveal = useSharedValue(0);
  const tail = useSharedValue(0);

  useEffect(() => {
    reveal.value = 0;
    tail.value = 0;
    reveal.value = withTiming(1, { duration: 520, easing: ease });
    tail.value = withDelay(120, withTiming(1, { duration: 520, easing: ease }));
  }, [classId, score, reveal, tail]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: 26 * (1 - reveal.value) },
      { scale: 0.97 + 0.03 * reveal.value },
    ],
  }));

  const tailStyle = useAnimatedStyle(() => ({
    opacity: tail.value,
    transform: [{ translateY: 10 * (1 - tail.value) }],
  }));

  const accent = COLORS.accent;

  return (
    <Animated.View style={sheetStyle}>
      <GlassSurface pill contentStyle={styles.core}>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {label(classId)}
          </Text>
        </View>

        <Animated.View
          style={[styles.scorePill, { backgroundColor: `${accent}1A` }, tailStyle]}
        >
          <Text style={[styles.scoreValue, { color: accent }]}>
            {Math.round(score * 100)}%
          </Text>
        </Animated.View>

        {/* The close glyph gets its own circle rather than sitting bare next
            to the text. Skia rather than modalIcons' View version: nothing
            here is inside an RN Modal, so the Canvas draws fine and this
            picks up the same stroke weight as every other icon on the camera
            screen. */}
        <Pressable
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={t('closeDetail')}
          hitSlop={12}
          onPress={onClose}
        >
          <Icon name="close" size={20} color={COLORS.textMuted} />
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  core: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    paddingLeft: 20,
    paddingRight: 10,
  },

  textCol: { maxWidth: 168 },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 14,
    letterSpacing: -0.3,
    textTransform: 'capitalize',
  },

  scorePill: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  scoreValue: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    letterSpacing: -0.2,
  },

  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.shell,
  },
});
