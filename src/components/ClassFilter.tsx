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
 * Bộ lọc theo loại vật thể, mặc định thu gọn thành một viên thuốc nhỏ.
 *
 * Ảnh vừa quét mới là thứ cần được nhìn, nên bộ lọc không chiếm sẵn một hàng
 * ngang màn hình: thu lại chỉ còn dòng tóm tắt, chạm mới bung ra bảng chip.
 *
 * Bảng chip là một bề mặt RIÊNG nổi lên trên, không phải phần bung ra của viên
 * thuốc: nằm chung một bề mặt thì lúc đóng hàng chip vẫn kéo giãn bề ngang, thu
 * gọn xong vẫn còn rộng nguyên. Tách ra thì mỗi lớp tự ôm lấy nội dung của nó.
 *
 * Chip dựng từ đúng những class có trong ảnh - không phải 90 class của COCO, vì
 * 85 class còn lại không liên quan gì tới tấm ảnh đang xem. Lọc ở đây chỉ là
 * lọc hiển thị, giống thanh ngưỡng: model đã quét hết rồi, tắt chip nào thì box
 * của class đó ẩn đi và không còn được đếm.
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
            {/* Xuống dòng thay vì cuộn ngang: một ảnh thường chỉ có vài loại,
                thấy hết một lượt vẫn hơn phải lướt đi tìm. */}
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
  // Chặn bề ngang ở đây: bảng chip nhiều loại thì xuống dòng chứ không tràn ra
  // ngoài mép màn hình. Viên thuốc tóm tắt tự canh giữa theo bảng.
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
    // Chip ôm trọn tên của nó. Hết chỗ thì cả chip xuống dòng - flexShrink của
    // RN mặc định là 0 nên không có chuyện bị bóp lại rồi cắt chữ thành "...".
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
