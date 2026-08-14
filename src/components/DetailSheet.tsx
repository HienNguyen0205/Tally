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
import { COCO_LABELS, labelVi } from '../shared/labels';
import { PERSON_CLASS_ID } from '../shared/constants';
import { GlassSurface } from './GlassSurface';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Detail sheet for one object: its name, a more specific name where one can be
 * guessed, and the confidence.
 *
 * A single row of three blocks: name - score pill - close. The score sits in a
 * pill tinted to the class colour rather than a label+number column, so it reads
 * both as the figure and as the thread tying this sheet to the box just tapped.
 */
export function DetailSheet({
  classId,
  score,
  refined,
  refining,
  onClose,
}: {
  classId: number;
  score: number;
  /** The classifier's guess, null when absent or not yet in. */
  refined?: { label: string; score: number } | null;
  refining?: boolean;
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

  const accent = classId === PERSON_CLASS_ID ? COLORS.accent : COLORS.warn;
  const en = COCO_LABELS[classId] ?? `#${classId}`;
  const vi = labelVi(classId);

  return (
    <Animated.View style={sheetStyle}>
      <GlassSurface pill contentStyle={styles.core}>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {vi}
          </Text>
          {/* The subline prefers the classifier's name - it says far more
              nhiều hơn hẳn tên gốc tiếng Anh của COCO. */}
          {refining === true ? (
            <Text style={[styles.subtitle, styles.subtitleWaiting]}>
              đang nhận dạng…
            </Text>
          ) : refined != null ? (
            <Text style={[styles.subtitle, styles.subtitleRefined]}>
              {refined.label} · {Math.round(refined.score * 100)}%
            </Text>
          ) : (
            vi !== en && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {en}
              </Text>
            )
          )}
        </View>

        <Animated.View
          style={[styles.scorePill, { backgroundColor: `${accent}1A` }, tailStyle]}
        >
          <Text style={[styles.scoreValue, { color: accent }]}>
            {Math.round(score * 100)}%
          </Text>
        </Animated.View>

        {/* The close glyph gets its own circle rather than sitting bare next
            to the text. */}
        <Pressable
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Đóng bảng chi tiết"
          hitSlop={12}
          onPress={onClose}
        >
          <Text style={styles.closeIcon}>✕</Text>
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

  // Wider than a COCO name needs, because the refined name is what earns the
  // reading here.
  textCol: { maxWidth: 168 },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 14,
    letterSpacing: -0.3,
    textTransform: 'capitalize',
  },
  subtitle: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 10.5,
    marginTop: 1,
  },
  subtitleRefined: { color: COLORS.textMuted, fontFamily: FONT.medium },
  subtitleWaiting: { fontStyle: 'italic' },

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
  closeIcon: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 12,
  },
});
