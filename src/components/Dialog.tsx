import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../shared/theme';
import { t } from '../i18n';

const ease = Easing.bezier(...EASE_OUT_EXPO);

export interface DialogAction {
  label: string;
  /**
   * `cancel` is the way out, `destructive` is the one that deletes something,
   * `primary` is everything else. Declared rather than guessed from position:
   * RN's Alert reorders buttons per platform, which is exactly the
   * inconsistency this component exists to remove.
   */
  variant?: 'primary' | 'destructive' | 'cancel';
  onPress?: () => void;
}

export interface DialogConfig {
  title: string;
  message?: string;
  /** Omitted for a plain notice - a single dismiss button is supplied. */
  actions?: DialogAction[];
}

/**
 * The app's own alert, replacing RN's `Alert.alert`.
 *
 * Alert draws the OS dialog - Material on Android, UIKit on iOS - so the one
 * surface asking to delete a scan looked nothing like the screen it was asked
 * from, and looked different again on the other platform. This is the same
 * card, pills and type as SettingsScreen.
 *
 * Not a `Modal`. SettingsScreen is itself one, and stacking Modals on Android
 * means two windows fighting over the same back button, with the inner one's
 * enter animation playing against the outer one's - the same reason
 * HistorySheet's Viewer is an overlay too. An absolutely positioned sibling
 * works from inside a Modal and from a plain screen alike.
 */
function Dialog({
  config,
  onDismiss,
}: {
  config: DialogConfig;
  onDismiss: () => void;
}) {
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withTiming(1, { duration: 200, easing: ease });
  }, [reveal]);

  // Only reaches here when nothing else owns the back press - which means the
  // plain-screen case. Inside a Modal the press goes to that Modal's
  // onRequestClose instead, so those callers chain it themselves (see
  // SettingsScreen); the two never both fire.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [onDismiss]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { scale: 0.94 + 0.06 * reveal.value },
      { translateY: 14 * (1 - reveal.value) },
    ],
  }));

  const actions: DialogAction[] = config.actions ?? [
    { label: t('close'), variant: 'primary' },
  ];

  return (
    <Animated.View style={[styles.backdrop, backdropStyle]}>
      {/* Tapping outside dismisses without running any action - which is what
          cancelling means, since a cancel action never carries an onPress. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={t('close')}
        onPress={onDismiss}
      />

      <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal>
        <Text style={styles.title}>{config.title}</Text>
        {config.message != null && (
          <Text style={styles.message}>{config.message}</Text>
        )}

        <View style={styles.actions}>
          {actions.map(action => {
            const variant = action.variant ?? 'primary';
            return (
              <Pressable
                key={action.label}
                style={[styles.button, styles[variant]]}
                accessibilityRole="button"
                onPress={() => {
                  // Dismiss first: an action that unmounts its own screen
                  // (sign out) would otherwise leave this dialog updating a
                  // component that is already gone.
                  onDismiss();
                  action.onPress?.();
                }}
              >
                <Text style={[styles.buttonText, styles[`${variant}Text`]]}>
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Owns one dialog's state and hands back the element to render.
 *
 * `show` stands in for `Alert.alert` at the call site, so swapping one for the
 * other is a rename plus named fields. Named `useDialog`, not `useAlert` -
 * that one already exists and buzzes the phone.
 */
export function useDialog() {
  const [config, setConfig] = useState<DialogConfig | null>(null);

  const show = useCallback((next: DialogConfig) => setConfig(next), []);
  const dismiss = useCallback(() => setConfig(null), []);

  return {
    show,
    dismiss,
    /** For chaining a Modal's `onRequestClose` - see the note in Dialog. */
    visible: config != null,
    /** Render last in the parent, so it paints over everything else. */
    dialog:
      config == null ? null : <Dialog config={config} onDismiss={dismiss} />,
  };
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    // Opaque, unlike SettingsScreen's translucent cards: those sit on a solid
    // screen, this one sits on a dimmed copy of whatever was underneath.
    backgroundColor: '#121316',
    padding: 22,
    gap: 8,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  message: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
  },

  // Stacked full width rather than a row: 'Xoá lịch sử quét' next to 'Huỷ'
  // does not fit two pills across a phone, and a row would either wrap or
  // squeeze the labels.
  actions: { marginTop: 10, gap: 8 },
  button: {
    borderRadius: RADIUS.pillShell,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: { fontFamily: FONT.semibold, fontSize: 14 },

  primary: { backgroundColor: COLORS.accent },
  primaryText: { color: COLORS.onAccent },
  destructive: { backgroundColor: '#FF453A' },
  destructiveText: { color: '#FFFFFF' },
  cancel: { backgroundColor: 'rgba(255,255,255,0.08)' },
  cancelText: { color: COLORS.textPrimary },
});
