import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

import { COLORS, FONT, RADIUS, BEZEL_PAD } from '../shared/theme';
import { locale, t } from '../i18n';
import { isValidEmail, mapAuthError, MIN_PASSWORD } from '../shared/authErrors';
import { useAuth } from '../hooks/useAuth';
import { useEnter } from '../hooks/useEnter';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { FormField } from '../components/FormField';
import { CtaButton } from '../components/CtaButton';
import { LanguageSheet } from '../components/LanguageSheet';
import { LogoMark } from '../components/LogoMark';
import { FlagIcon } from '../components/FlagIcon';

type Mode = 'register' | 'signin';

interface Props {
  /** Drops the whole app into a session-less mode: DetectorScreen becomes
   *  reachable, but nothing gets written to history - see useScanHistory. */
  onContinueAsGuest: () => void;
}

/**
 * The gate in front of the whole app. App.tsx renders this instead of
 * DetectorScreen whenever useAuth's `email` is null, and swaps over the
 * moment a sign-in or sign-up succeeds - there is no skip button here on
 * purpose, and nothing else in the app is reachable until one of the two
 * forms below succeeds (or the guest link below is used instead).
 */
export function AuthScreen({ onContinueAsGuest }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Landscape has room for the wordmark beside the form rather than above it,
  // and no room to stack them - the same split the rest of the HUD makes.
  const landscape = width > height;

  const { register, signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('register');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const passwordRef = useRef<TextInput | null>(null);
  const languageSheetRef = useRef<TrueSheet | null>(null);
  const langPress = useSharedValue(0);
  const langPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.1 * langPress.value }],
  }));

  const brandIn = useEnter(0);
  const tabsIn = useEnter(90);
  const cardIn = useEnter(180);
  const emailIn = useEnter(260);
  const passwordIn = useEnter(320);
  const ctaIn = useEnter(380);

  // A short horizontal shake on the card whenever a new error lands - error
  // text alone is easy to skim past, the card physically objecting is not.
  const shakeX = useSharedValue(0);
  useEffect(() => {
    if (error == null) return;
    shakeX.value = withSequence(
      withTiming(-10, { duration: 55 }),
      withTiming(10, { duration: 55 }),
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }, [error, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    // A password typed for "create account" has no business surviving into
    // "sign in" (and the reverse is just as wrong) - each tab starts clean
    // rather than carrying the other mode's half-finished input over.
    setEmailInput('');
    setPasswordInput('');
    setRevealed(false);
    setError(null);
    setNotice(null);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setNotice(null);

    const trimmedEmail = emailInput.trim();
    // Checked here rather than left to the server: both messages already exist
    // in strings.ts, and a round trip to be told the address has no @ in it is
    // a round trip that did not need to happen.
    if (!isValidEmail(trimmedEmail)) {
      setError(t('authErrorInvalidEmail'));
      return;
    }
    // Register only. An account created before a policy change can legitimately
    // have a shorter password, and refusing to even attempt the sign-in would
    // lock its owner out with a message about a rule that does not apply to
    // them.
    if (mode === 'register' && passwordInput.length < MIN_PASSWORD) {
      setError(t('authErrorWeakPassword'));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const result = await register(trimmedEmail, passwordInput);
        if (result.error != null) {
          setError(mapAuthError(result.error));
          return;
        }
        // 'done' signs the app straight in - App.tsx notices the new session
        // and swaps to DetectorScreen on its own, nothing to do here beyond
        // that. 'confirm' has no session yet, so the notice is all there is.
        if (result.status === 'confirm') {
          setNotice(t('confirmEmailSent', { email: trimmedEmail }));
        }
      } else {
        const { error: signInError } = await signIn(trimmedEmail, passwordInput);
        if (signInError != null) setError(mapAuthError(signInError));
      }
    } finally {
      setSubmitting(false);
    }
  }, [mode, emailInput, passwordInput, register, signIn]);

  const blocked = submitting || emailInput === '' || passwordInput === '';

  // A soft glow breathes behind the CTA once the form is actually submittable
  // - the button stops being just another control and starts drawing the eye
  // toward the one thing left to do.
  const ctaGlow = useSharedValue(0);
  useEffect(() => {
    if (blocked) {
      ctaGlow.value = withTiming(0, { duration: 240 });
      return;
    }
    ctaGlow.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [blocked, ctaGlow]);
  const ctaGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.35 * ctaGlow.value,
    transform: [{ scale: 1 + 0.05 * ctaGlow.value }],
  }));

  return (
    <View style={styles.root}>
      <AmbientBackdrop width={width} height={height} />

      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            landscape && styles.scrollLandscape,
            {
              paddingTop: insets.top + (landscape ? 24 : 56),
              paddingBottom: insets.bottom + 32,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.brand, landscape && styles.brandLandscape, brandIn]}
          >
            <LogoMark size={76} />
            <Text style={styles.name}>Tally</Text>
            <Text style={styles.subtitle}>{t('authSubtitle')}</Text>
          </Animated.View>

          <View style={[styles.column, landscape && styles.columnLandscape]}>
            <Animated.View style={tabsIn}>
              <SegmentedTabs
                options={[
                  { value: 'register', label: t('tabRegister') },
                  { value: 'signin', label: t('tabSignIn') },
                ]}
                selected={mode}
                onSelect={switchMode}
              />
            </Animated.View>

            {/* Double bezel, but no BlurView: there is nothing behind this card
                except the static backdrop, so real blur would cost GPU frames
                on every keystroke and look identical to a flat translucent
                core. GlassSurface is for surfaces with a camera under them. */}
            <Animated.View style={[styles.cardShell, cardIn, shakeStyle]}>
              <View style={styles.cardCore}>
                <Animated.View style={emailIn}>
                  <FormField
                    label={t('emailLabel')}
                    placeholder={t('emailHint')}
                    value={emailInput}
                    onChangeText={setEmailInput}
                    editable={!submitting}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </Animated.View>
                <Animated.View style={passwordIn}>
                  <FormField
                    label={t('passwordLabel')}
                    placeholder={t('passwordHint')}
                    value={passwordInput}
                    onChangeText={setPasswordInput}
                    editable={!submitting}
                    inputRef={passwordRef}
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    textContentType={
                      mode === 'register' ? 'newPassword' : 'password'
                    }
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (!blocked) submit();
                    }}
                    secure={{
                      visible: revealed,
                      onToggle: () => setRevealed(v => !v),
                      showLabel: t('showPassword'),
                      hideLabel: t('hidePassword'),
                    }}
                  />
                </Animated.View>

                {error != null && (
                  <View style={[styles.banner, styles.bannerError]}>
                    <Text style={styles.bannerErrorText}>{error}</Text>
                  </View>
                )}
                {notice != null && (
                  <View style={[styles.banner, styles.bannerNotice]}>
                    <Text style={styles.bannerNoticeText}>{notice}</Text>
                  </View>
                )}

                <Animated.View style={[styles.ctaWrap, ctaIn]}>
                  <Animated.View
                    style={[styles.ctaGlow, ctaGlowStyle]}
                    pointerEvents="none"
                  />
                  <CtaButton
                    block
                    label={mode === 'register' ? t('registerSubmit') : t('signInSubmit')}
                    loading={submitting}
                    disabled={blocked}
                    onPress={submit}
                  />
                </Animated.View>
              </View>
            </Animated.View>

            <Animated.View style={ctaIn}>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={onContinueAsGuest}
              >
                <Text style={styles.guestLink}>{t('continueAsGuest')}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Declared after KeyboardAvoidingView, not before: an absolute sibling
          painted earlier in the tree sits BEHIND a later, full-bleed one for
          touch purposes even though the ScrollView over it is visually empty
          there - drawn last so it actually receives the tap instead of the
          scroll view swallowing it first. Reachable before signing in, not
          just after - unlike SettingsScreen's language control, which only
          exists once the camera screen is. No GlassSurface either, same
          reasoning as the form card above: no camera feed behind it for real
          blur to be worth the GPU cost. */}
      <View style={[styles.langButtonShell, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('changeLanguage')}
          onPressIn={() => {
            langPress.value = withTiming(1, { duration: 130 });
          }}
          onPressOut={() => {
            langPress.value = withTiming(0, { duration: 380 });
          }}
          onPress={() => languageSheetRef.current?.present()}
        >
          <Animated.View style={[styles.langButtonInner, langPressStyle]}>
            {/* The flag of the language currently in effect, not a generic
                globe - the button doubles as a small "this is what's active"
                indicator, the same way the segmented tabs below double as
                one. A drawn flag rather than the OS emoji glyph: the emoji's
                own little rectangle (with its own padding baked into the
                character cell) can only ever sit inside this circle, never
                fill it edge to edge the way FlagIcon's Skia clip does.
                `locale` is a live binding (see i18n/index.ts): this reads the
                current value on every render, and AuthScreen re-renders
                whenever it changes because App.tsx's Root subscribes via
                useLocale() and nothing here memoises. */}
            <FlagIcon locale={locale} size={40} />
          </Animated.View>
        </Pressable>
      </View>
      <LanguageSheet sheetRef={languageSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
    gap: 34,
  },
  scrollLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
    paddingHorizontal: 40,
  },

  // --- Brand block ---
  brand: { alignItems: 'center', gap: 12 },
  brandLandscape: { flex: 1, alignItems: 'flex-start' },
  name: {
    color: COLORS.textPrimary,
    fontFamily: FONT.bold,
    fontSize: 46,
    letterSpacing: -1.6,
    lineHeight: 52,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 14,
  },

  column: { gap: 18 },
  columnLandscape: { flex: 1, maxWidth: 440 },

  // --- Form card (double bezel) ---
  cardShell: {
    borderRadius: RADIUS.shell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.shell,
    padding: BEZEL_PAD,
  },
  cardCore: {
    borderRadius: RADIUS.core,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.coreHighlight,
    backgroundColor: 'rgba(9,10,12,0.62)',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
  },

  // --- Banners ---
  banner: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bannerError: {
    borderColor: 'rgba(255,69,58,0.35)',
    backgroundColor: 'rgba(255,69,58,0.10)',
  },
  bannerErrorText: {
    color: '#FF6961',
    fontFamily: FONT.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerNotice: {
    borderColor: 'rgba(0,230,118,0.32)',
    backgroundColor: 'rgba(0,230,118,0.09)',
  },
  bannerNoticeText: {
    color: COLORS.accent,
    fontFamily: FONT.medium,
    fontSize: 13,
    lineHeight: 18,
  },

  ctaWrap: { marginTop: 4 },
  // Sits behind the CTA pill, slightly larger on every side, fading in and out
  // rather than a real blur (RN has no cheap cross-platform blur for an
  // arbitrary tinted shape) - the same layered-translucency trick GlassSurface
  // and ScanOverlay's sweep glow already use elsewhere in this app. A sibling
  // of the button inside the same wrapper, not a child of `cta`, so the -6
  // inset on every side is relative to the button's own box with no extra
  // offset to compensate for.
  ctaGlow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: RADIUS.pillShell + 6,
    backgroundColor: 'rgba(0,230,118,0.35)',
  },

  langButtonShell: {
    position: 'absolute',
    right: 20,
    zIndex: 1,
  },
  langButtonInner: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pillShell,
    // A ring around the flag rather than a background behind it - FlagIcon
    // is an opaque circle the same size as this box, so anything painted
    // behind it would never actually show.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    overflow: 'hidden',
  },
  guestLink: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
