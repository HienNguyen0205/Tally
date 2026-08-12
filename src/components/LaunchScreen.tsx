import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);
const SIZE = 132;
const VIEWPORT = 108;
const SCALE = SIZE / VIEWPORT;
const DRAW_MS = 520;
const GAP_MS = 130;

// Cùng hình với icon launcher (res/drawable/ic_launcher_foreground.xml) để splash
// của hệ điều hành chuyển sang màn này không bị hẫng.
const STROKES = [
  'M40 42 L40 66',
  'M49 42 L49 66',
  'M58 42 L58 66',
  'M67 42 L67 66',
];
const SLASH = 'M35 68 L72 40';

/** Một nét, tự vẽ dần từ đầu tới cuối theo thứ tự index. */
function Stroke({
  d,
  index,
  color,
  progress,
}: {
  d: string;
  index: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const path = Skia.Path.MakeFromSVGString(d);
  // Mỗi nét chiếm một lát của tiến trình chung, lệch nhau GAP_MS.
  const total = GAP_MS * STROKES.length + DRAW_MS;
  const from = (index * GAP_MS) / total;
  const to = from + DRAW_MS / total;

  const end = useDerivedValue(() => {
    const t = (progress.value - from) / (to - from);
    return Math.min(1, Math.max(0, t));
  });

  if (path == null) return null;
  return (
    <Path
      path={path}
      style="stroke"
      // Path vẽ theo lưới 108, canvas lớn hơn nên phải co giãn - chia ngược lại
      // cho strokeWidth để nét không dày lên theo.
      strokeWidth={4.5 / SCALE}
      strokeCap="round"
      color={color}
      transform={[{ scale: SCALE }]}
      origin={{ x: 0, y: 0 }}
      start={0}
      end={end}
    />
  );
}

/**
 * Màn hình lúc mới mở app, trong khi model đang nạp.
 * Nền và logo trùng khớp với splash của hệ điều hành nên người dùng thấy như
 * một mạch liên tục chứ không phải hai màn hình nối nhau.
 */
export function LaunchScreen({ status }: { status: string }) {
  const draw = useSharedValue(0);
  const textIn = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    draw.value = withTiming(1, { duration: 1150, easing: ease });
    textIn.value = withDelay(
      620,
      withTiming(1, { duration: 620, easing: ease }),
    );
    // Nhịp thở nhẹ để màn hình không chết cứng nếu model nạp lâu.
    pulse.value = withDelay(
      1150,
      withRepeat(withTiming(1, { duration: 1400, easing: ease }), -1, true),
    );
  }, [draw, textIn, pulse]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: 0.82 + 0.18 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.012 * pulse.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateY: 14 * (1 - textIn.value) }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={logoStyle}>
        <Canvas style={styles.canvas}>
          {STROKES.map((d, i) => (
            <Stroke
              key={d}
              d={d}
              index={i}
              color={COLORS.accent}
              progress={draw}
            />
          ))}
          <Stroke
            d={SLASH}
            index={STROKES.length}
            color={COLORS.textPrimary}
            progress={draw}
          />
        </Canvas>
      </Animated.View>

      <Animated.View style={[styles.textBlock, textStyle]}>
        <Text style={styles.name}>Tally</Text>
        <Text style={styles.status}>{status}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    gap: 26,
  },
  canvas: { width: SIZE, height: SIZE },
  textBlock: { alignItems: 'center', gap: 8 },
  name: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  status: {
    color: COLORS.textFaint,
    fontFamily: FONT.medium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
});
