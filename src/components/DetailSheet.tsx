import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../theme';
import { COCO_LABELS, labelVi } from '../labels';
import { PERSON_CLASS_ID } from '../constants';
import { GlassSurface } from './GlassSurface';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Bảng chi tiết của một vật thể: tên, tên chi tiết hơn nếu đoán được, và độ
 * tin cậy.
 *
 * Một hàng ngang duy nhất, ba khối: tên - viên điểm - nút đóng. Điểm nằm trong
 * viên thuốc nhuộm theo màu class chứ không phải một cột nhãn+số, để nó vừa là
 * số liệu vừa là thứ nối bảng này với cái box vừa chạm.
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
  /** Tên chi tiết do model phân loại đoán, null nếu chưa/không có. */
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
          {/* Dòng phụ ưu tiên tên chi tiết từ model phân loại - nó nói được
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

        {/* Dấu đóng lồng trong vòng tròn riêng, không đứng trần cạnh chữ. */}
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

  // Rộng hơn tên COCO cần, vì tên chi tiết mới là thứ đáng đọc ở đây.
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
