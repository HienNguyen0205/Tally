import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../theme';
import { Icon } from './icons';

const TRACK_W = 104;
const KNOB = 18;
const MIN = 0.2;
const MAX = 0.9;
const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  value: number;
  onChange: (v: number) => void;
}

/**
 * Thanh trượt ngưỡng tin cậy - kéo trực tiếp thay vì bấm xoay vòng.
 *
 * Dùng PanResponder của RN core (dự án không có gesture-handler). Cử chỉ chạy
 * trên JS thread nhưng chỉ ghi vào shared value, còn phần vẽ do Reanimated lo
 * trên UI thread nên vẫn mượt.
 */
export function ThresholdSlider({ value, onChange }: Props) {
  const travel = TRACK_W - KNOB;
  const progress = useSharedValue((value - MIN) / (MAX - MIN));
  // Giá trị lúc bắt đầu kéo, để cộng dồn quãng đường ngón tay.
  const startProgress = useRef(progress.value);
  const grabbed = useSharedValue(0);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startProgress.current = progress.value;
          grabbed.value = withTiming(1, { duration: 160, easing: ease });
        },
        onPanResponderMove: (_, g) => {
          const next = clamp(startProgress.current + g.dx / travel);
          progress.value = next;
          // Làm tròn 1% để không đẩy state React mỗi pixel.
          onChange(Math.round((MIN + next * (MAX - MIN)) * 100) / 100);
        },
        onPanResponderRelease: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
        },
        onPanResponderTerminate: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
        },
      }),
    [grabbed, progress, travel, onChange],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * travel },
      { scale: 1 + 0.25 * grabbed.value },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View style={styles.wrap} {...pan.panHandlers}>
      <Icon name="target" size={15} color={COLORS.textMuted} strokeWidth={1.5} />

      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.knob, knobStyle]} />
      </View>

      <Text style={styles.value}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  track: {
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    // Co giãn từ mép trái thay vì từ tâm.
    transformOrigin: 'left',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fff',
  },
  value: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
    minWidth: 34,
    textAlign: 'right',
  },
});
