import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, RADIUS } from '../theme';
import { Icon, type IconName } from './icons';

const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  name: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** Nút icon tròn: lún xuống khi nhấn, nền sáng lên khi đang bật. */
export function IconButton({
  name,
  label,
  active = false,
  disabled = false,
  onPress,
}: Props) {
  const press = useSharedValue(0);
  const on = useSharedValue(active ? 1 : 0);
  // Trong effect, không phải giữa thân render - Reanimated cảnh báo đúng.
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: 280, easing: ease });
  }, [active, on]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.12 * press.value }],
    backgroundColor: `rgba(0,230,118,${0.95 * on.value})`,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 130, easing: ease });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 380, easing: ease });
      }}
      onPress={onPress}
    >
      <Animated.View style={[styles.btn, style]}>
        <Icon
          name={name}
          size={20}
          color={active ? '#04120A' : COLORS.textPrimary}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pillShell,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
