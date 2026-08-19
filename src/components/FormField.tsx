import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../shared/theme';
import { Icon } from './icons';

const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  editable: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  /** Present on password fields only: renders the reveal toggle. */
  secure?: {
    visible: boolean;
    onToggle: () => void;
    showLabel: string;
    hideLabel: string;
  };
}

/**
 * One labelled text input with a focus ring.
 *
 * The enclosure brightens toward the accent on focus rather than switching
 * border colour outright - with several fields stacked, an instant swap is the
 * difference between "which one am I typing in" and not having to ask.
 */
export function FormField({
  label,
  placeholder,
  value,
  onChangeText,
  editable,
  keyboardType,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  inputRef,
  secure,
}: Props) {
  const focus = useSharedValue(0);

  const shellStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [COLORS.hairline, 'rgba(0,230,118,0.55)'],
    ),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      ['rgba(255,255,255,0.045)', 'rgba(0,230,118,0.07)'],
    ),
    // A small lift rather than just a colour change - the field visibly comes
    // toward you when it takes focus, not just changes tint.
    transform: [{ scale: 1 + 0.012 * focus.value }],
  }));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.shell, shellStyle]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textFaint}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          // 'submit' fires onSubmitEditing without dismissing the keyboard,
          // which is what moving focus to the next field needs.
          submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
          secureTextEntry={secure != null && !secure.visible}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          onFocus={() => {
            focus.value = withTiming(1, { duration: 260, easing: ease });
          }}
          onBlur={() => {
            focus.value = withTiming(0, { duration: 420, easing: ease });
          }}
        />
        {secure != null && (
          <Pressable
            style={styles.reveal}
            accessibilityRole="button"
            accessibilityLabel={
              secure.visible ? secure.hideLabel : secure.showLabel
            }
            hitSlop={10}
            onPress={secure.onToggle}
          >
            <Icon
              name={secure.visible ? 'eye' : 'eyeOff'}
              size={19}
              color={COLORS.textMuted}
            />
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 9 },
  label: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 9,
    letterSpacing: 2,
    marginLeft: 4,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: 8,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 15,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  reveal: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pillShell,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
