import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { COLORS, FONT, RADIUS, BEZEL_PAD } from '../shared/theme';
import { t } from '../i18n';
import { isValidEmail, mapAuthError, MIN_PASSWORD } from '../shared/authErrors';
import { useAuth } from '../hooks/useAuth';
import { useEnter } from '../hooks/useEnter';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { FormField } from '../components/FormField';
import { CtaButton } from '../components/CtaButton';

type Mode = 'register' | 'signin';

/**
 * The gate in front of the whole app. App.tsx renders this instead of
 * DetectorScreen whenever useAuth's `email` is null, and swaps over the
 * moment a sign-in or sign-up succeeds - there is no skip button here on
 * purpose, and nothing else in the app is reachable until one of the two
 * forms below succeeds.
 */
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Landscape has room for the wordmark beside the form rather than above it,
  // and no room to stack them - the same split the rest of the HUD makes.
  const landscape = width > height;

  const { register, signIn } = useAuth();
  const [mode, setMode] = React.useState<Mode>('register');
  const [emailInput, setEmailInput] = React.useState('');
  const [passwordInput, setPasswordInput] = React.useState('');
  const [revealed, setRevealed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const passwordRef = React.useRef<TextInput | null>(null);

  const brandIn = useEnter(0);
  const tabsIn = useEnter(90);
  const cardIn = useEnter(180);

  const switchMode = React.useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  }, []);

  const submit = React.useCallback(async () => {
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
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrow}>{t('authEyebrow')}</Text>
            </View>
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
            <Animated.View style={[styles.cardShell, cardIn]}>
              <View style={styles.cardCore}>
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

                <CtaButton
                  block
                  style={styles.cta}
                  label={mode === 'register' ? t('registerSubmit') : t('signInSubmit')}
                  loading={submitting}
                  disabled={blocked}
                  onPress={submit}
                />
              </View>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  eyebrowPill: {
    borderRadius: RADIUS.pillShell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.shell,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  eyebrow: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 9,
    letterSpacing: 2.4,
  },
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

  cta: { marginTop: 4 },
});
