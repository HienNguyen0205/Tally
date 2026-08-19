import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../shared/theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  label: string;
  onPress: () => void;
  /** Swaps the label for a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Full width with a centred label, instead of hugging its content. */
  block?: boolean;
  style?: ViewStyle;
}

/**
 * The app's one primary button: an accent pill with its arrow nested in its own
 * circle, flush with the right inner padding.
 *
 * The nested circle is the whole point - an arrow sitting naked next to the
 * label has nothing holding it in place, and the eye reads it as a stray glyph
 * rather than part of the control. Pressing sinks the pill slightly so the
 * touch has a physical answer.
 */
export function CtaButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  block = false,
  style,
}: Props) {
  const press = useSharedValue(0);
  const blocked = disabled || loading;

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.03 * press.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 130, easing: ease });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 380, easing: ease });
      }}
      onPress={onPress}
      style={style}
    >
      <Animated.View
        style={[
          styles.pill,
          block ? styles.block : styles.hug,
          blocked && styles.muted,
          pressStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.onAccent} />
        ) : (
          <>
            <Text style={[styles.label, blocked && styles.mutedText]}>
              {label}
            </Text>
            <View style={[styles.icon, blocked && styles.mutedIcon]}>
              <Text style={[styles.arrow, blocked && styles.mutedText]}>↗</Text>
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pillShell,
    paddingLeft: 22,
    paddingRight: 6,
    paddingVertical: 6,
  },
  hug: { alignSelf: 'flex-start' },
  block: { justifyContent: 'center', minHeight: 56 },
  muted: { backgroundColor: 'rgba(255,255,255,0.08)' },
  label: { color: COLORS.onAccent, fontFamily: FONT.semibold, fontSize: 15 },
  mutedText: { color: COLORS.textFaint },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedIcon: { backgroundColor: 'rgba(255,255,255,0.06)' },
  arrow: { color: COLORS.onAccent, fontFamily: FONT.semibold, fontSize: 14 },
});
