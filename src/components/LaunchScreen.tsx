import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { LogoMark } from './LogoMark';

const ease = Easing.bezier(...EASE_OUT_EXPO);

/**
 * Shown while the model loads. Background and logo match the OS splash, so it
 * reads as one continuous beat rather than two screens spliced together.
 */
export function LaunchScreen({ status }: { status: string }) {
  const textIn = useSharedValue(0);

  useEffect(() => {
    textIn.value = withDelay(
      620,
      withTiming(1, { duration: 620, easing: ease }),
    );
  }, [textIn]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateY: 14 * (1 - textIn.value) }],
  }));

  return (
    <View style={styles.root}>
      <LogoMark size={132} />

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
