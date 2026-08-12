import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../theme';

const ITEM_W = 52;
const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  steps: number[];
  value: number;
  onChange: (v: number) => void;
}

/**
 * Chọn mức zoom: chạm để nhảy tới, hoặc kéo ngang để lướt qua các mức.
 * Chỉ báo nền trượt theo với quán tính thay vì đổi màu tức thì.
 */
export function ZoomSelector({ steps, value, onChange }: Props) {
  const index = Math.max(0, steps.indexOf(value));
  const pos = useSharedValue(index);
  const startIndex = useRef(index);

  // Đồng bộ khi giá trị bị đổi từ bên ngoài (vd: reset về 1x).
  if (Math.abs(pos.value - index) > 0.001 && startIndex.current === index) {
    pos.value = withTiming(index, { duration: 420, easing: ease });
  }

  const moveTo = (i: number) => {
    const clamped = Math.min(steps.length - 1, Math.max(0, i));
    startIndex.current = clamped;
    pos.value = withTiming(clamped, { duration: 420, easing: ease });
    const next = steps[clamped];
    if (next != null && next !== value) onChange(next);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Chỉ cướp cử chỉ khi thật sự kéo ngang, để cú chạm vẫn tới được nút.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6,
        onPanResponderGrant: () => {
          startIndex.current = Math.round(pos.value);
        },
        onPanResponderMove: (_, g) => {
          const raw = startIndex.current + g.dx / ITEM_W;
          pos.value = Math.min(steps.length - 1, Math.max(0, raw));
        },
        onPanResponderRelease: () => {
          // Thả ra thì bám vào mức gần nhất.
          moveTo(Math.round(pos.value));
        },
        onPanResponderTerminate: () => moveTo(Math.round(pos.value)),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, value, onChange],
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * ITEM_W }],
  }));

  return (
    <View style={styles.row} {...pan.panHandlers}>
      <Animated.View style={[styles.pill, pillStyle]} />

      {steps.map((z, i) => (
        <Pressable
          key={z}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel={`Phóng to ${z} lần`}
          accessibilityState={{ selected: z === value }}
          onPress={() => moveTo(i)}
        >
          <ZoomLabel active={z === value}>{`${z}×`}</ZoomLabel>
        </Pressable>
      ))}
    </View>
  );
}

/** Nhãn đổi màu mềm theo trạng thái thay vì nhảy màu đột ngột. */
function ZoomLabel({
  children,
  active,
}: {
  children: string;
  active: boolean;
}) {
  const on = useSharedValue(active ? 1 : 0);
  on.value = withTiming(active ? 1 : 0, { duration: 320, easing: ease });

  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * on.value,
    transform: [{ scale: 0.94 + 0.06 * on.value }],
  }));

  return (
    <Animated.Text style={[styles.label, active && styles.labelActive, style]}>
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    position: 'absolute',
    width: ITEM_W,
    height: 34,
    borderRadius: RADIUS.pillShell,
    backgroundColor: COLORS.accent,
  },
  item: {
    width: ITEM_W,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  labelActive: { color: '#04120A', fontFamily: FONT.semibold },
});
