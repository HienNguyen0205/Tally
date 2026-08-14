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
import { GlassSurface } from './GlassSurface';

interface Props {
  peopleCount: number;
  objectCount: number;
}

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Bảng kết quả nổi ở đỉnh màn hình. Chỉ dựng khi đã có kết quả - lúc chưa quét
 * thì không có gì để nói, và khung hình đáng được nhìn hơn một dòng gợi ý.
 */
export function ResultIsland({ peopleCount, objectCount }: Props) {
  const { width, height } = useWindowDimensions();
  // Nằm ngang: dạt sang trái để không đụng nút chụp đã chuyển sang cạnh phải.
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
  }, [peopleCount, objectCount, reveal, stagger]);

  // Chỉ animate transform/opacity - không đụng width/height để khỏi reflow.
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

  const present = peopleCount > 0;

  return (
    <View
      style={[styles.anchor, landscape && styles.anchorLandscape]}
      pointerEvents="none"
    >
      <Animated.View style={shellStyle}>
        <GlassSurface pill contentStyle={styles.corePill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: present ? COLORS.accent : COLORS.textFaint },
            ]}
          />
          <Text style={styles.count}>{peopleCount}</Text>
          <Text style={styles.unit}>người</Text>

          <Animated.View style={[styles.tail, staggerStyle]}>
            <View style={styles.dividerV} />
            <Text style={styles.objects}>{objectCount}</Text>
            <Text style={styles.unit}>vật thể</Text>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  anchorLandscape: {
    top: 28,
    left: 28,
    right: undefined,
    alignItems: 'flex-start',
  },
  // Một dòng ngang duy nhất - chế độ xem ảnh cần nhường chỗ cho khung hình.
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
  dividerV: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: COLORS.hairline,
    marginRight: 1,
  },
});
