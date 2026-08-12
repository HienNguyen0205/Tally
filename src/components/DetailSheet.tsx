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

export interface DetailInfo {
  classId: number;
  score: number;
  /** Phần khung hình mà vật thể chiếm, 0..1 */
  areaRatio: number;
}

export function DetailSheet({
  info,
  onClose,
}: {
  info: DetailInfo;
  onClose: () => void;
}) {
  const reveal = useSharedValue(0);
  const rows = useSharedValue(0);

  useEffect(() => {
    reveal.value = 0;
    rows.value = 0;
    reveal.value = withTiming(1, { duration: 520, easing: ease });
    rows.value = withDelay(120, withTiming(1, { duration: 520, easing: ease }));
  }, [info, reveal, rows]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: 26 * (1 - reveal.value) },
      { scale: 0.97 + 0.03 * reveal.value },
    ],
  }));

  const rowsStyle = useAnimatedStyle(() => ({
    opacity: rows.value,
    transform: [{ translateY: 10 * (1 - rows.value) }],
  }));

  const isPerson = info.classId === PERSON_CLASS_ID;
  const accent = isPerson ? COLORS.accent : COLORS.warn;
  const en = COCO_LABELS[info.classId] ?? `#${info.classId}`;
  const vi = labelVi(info.classId);

  return (
    <Animated.View style={sheetStyle}>
      <GlassSurface pill contentStyle={styles.core}>
        <View style={[styles.dot, { backgroundColor: accent }]} />

        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {vi}
          </Text>
          {vi !== en && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {en}
            </Text>
          )}
        </View>

        <Animated.View style={[styles.stats, rowsStyle]}>
          <Stat label="TIN CẬY" value={`${Math.round(info.score * 100)}%`} />
          <View style={styles.statDivider} />
          <Stat
            label="DIỆN TÍCH"
            value={`${(info.areaRatio * 100).toFixed(1)}%`}
          />
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng bảng chi tiết"
          hitSlop={14}
          onPress={onClose}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Một hàng ngang duy nhất: chấm màu · tên · số liệu · nút đóng.
  core: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  textCol: { maxWidth: 116 },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
    letterSpacing: -0.2,
    textTransform: 'capitalize',
  },
  subtitle: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 10,
  },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: COLORS.hairline,
  },
  statLabel: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 8,
    letterSpacing: 1.4,
  },
  statValue: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
  closeIcon: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
});
