import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../theme';
import { PERSON_CLASS_ID } from '../constants';
import { labelVi } from '../labels';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons';

const ease = Easing.bezier(...EASE_OUT_EXPO);

export interface ClassCount {
  classId: number;
  count: number;
}

/**
 * Bộ lọc theo loại vật thể: thu gọn thành viên thuốc tóm tắt, chạm mới bung ra
 * bảng chip. Chip chỉ gồm những class có trong ảnh, không phải 90 class COCO.
 *
 * Lọc ở đây là lọc hiển thị, giống thanh ngưỡng - model đã quét hết rồi.
 *
 * Bảng chip là bề mặt RIÊNG nổi lên trên chứ không nằm chung với viên thuốc:
 * chung một bề mặt thì lúc đóng, hàng chip vẫn kéo giãn bề ngang nên thu gọn
 * xong vẫn rộng nguyên.
 */
export function ClassFilter({
  counts,
  hidden,
  onToggle,
}: {
  counts: ClassCount[];
  hidden: ReadonlySet<number>;
  onToggle: (classId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const reveal = useSharedValue(0);

  useEffect(() => {
    reveal.value = 0;
    if (open) reveal.value = withTiming(1, { duration: 420, easing: ease });
  }, [open, reveal]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: 10 * (1 - reveal.value) },
      { scale: 0.97 + 0.03 * reveal.value },
    ],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${180 * reveal.value}deg` }],
  }));

  if (counts.length === 0) return null;

  const shown = counts.length - hidden.size;
  const summary =
    hidden.size === 0
      ? `${counts.length} loại`
      : `${shown}/${counts.length} loại`;

  return (
    <View style={styles.wrap}>
      {open && (
        <Animated.View style={panelStyle}>
          <GlassSurface contentStyle={styles.panelCore}>
            <View style={styles.row}>
              {counts.map(({ classId, count }) => {
                const off = hidden.has(classId);
                const color =
                  classId === PERSON_CLASS_ID ? COLORS.accent : COLORS.warn;
                const name = labelVi(classId);

                return (
                  <Pressable
                    key={classId}
                    style={[styles.chip, off && styles.chipOff]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !off }}
                    accessibilityLabel={`${name}, ${count} vật thể`}
                    onPress={() => onToggle(classId)}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: color },
                        off && styles.dotOff,
                      ]}
                    />
                    <Text style={[styles.name, off && styles.textOff]}>
                      {name}
                    </Text>
                    <Text style={[styles.count, off && styles.textOff]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassSurface>
        </Animated.View>
      )}

      <GlassSurface pill contentStyle={styles.headerCore}>
        <Pressable
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={
            open ? 'Thu gọn bộ lọc loại vật thể' : 'Mở bộ lọc loại vật thể'
          }
          onPress={() => setOpen(o => !o)}
        >
          <Icon
            name="filter"
            size={13}
            // Sáng lên khi đang lọc, để thu gọn rồi vẫn biết là có class bị ẩn.
            color={hidden.size === 0 ? COLORS.textMuted : COLORS.accent}
            strokeWidth={1.6}
          />
          <Text style={styles.summary}>{summary}</Text>
          <Animated.View style={chevronStyle}>
            <Icon
              name="chevron"
              size={13}
              color={COLORS.textFaint}
              strokeWidth={1.6}
            />
          </Animated.View>
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Chặn bề ngang ở đây để chip xuống dòng thay vì tràn ra mép màn hình.
  wrap: { alignItems: 'center', gap: 8, maxWidth: '92%' },

  headerCore: { paddingHorizontal: 6, paddingVertical: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  summary: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  panelCore: { padding: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    // Ôm trọn tên; hết chỗ thì cả chip xuống dòng chứ không bị bóp rồi cắt
    // chữ thành "...".
    flexShrink: 0,
  },
  chipOff: { backgroundColor: 'transparent' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOff: { opacity: 0.3 },
  name: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  count: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
  },
  textOff: { color: COLORS.textFaint },
});
