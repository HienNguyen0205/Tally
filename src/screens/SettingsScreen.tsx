import { useCallback, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../shared/theme';
import { locale, setLocale, t, type Locale } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import type { useSettings } from '../hooks/useSettings';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { ThresholdSlider } from '../components/ThresholdSlider';
import { CloseIcon } from '../components/modalIcons';
import { useDialog } from '../components/Dialog';

/**
 * Section label, and the sections themselves - plain tinted panels rather than
 * GlassSurface's blur: this is a Modal, same as HistorySheet, and Skia is
 * proven blank inside one on Android (see modalIcons.tsx). Whether BlurView
 * fares better is untested, so this mirrors HistorySheet's own already-proven
 * Modal-safe look (a flat translucent tint, no blur) instead of gambling on it.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  label,
  hint,
  stacked = false,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * Put the control on its own line under the text instead of beside it.
   *
   * For a `Switch` the side-by-side layout is right - it is narrow, and the
   * text keeps almost the whole row. A slider is not: ThresholdSlider is a
   * fixed ~170dp wide, which on a 393dp screen leaves the text column under
   * 150dp once the card padding and gap come out. Measured on device, that
   * wrapped "Ngưỡng tin cậy mặc định" onto two lines and its hint onto five,
   * and it gets worse at larger system font scales.
   */
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={stacked ? styles.rowStacked : styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint != null && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

interface Props {
  settings: ReturnType<typeof useSettings>;
  /** For the clear-history confirmation and its disabled state. Always 0 for
   *  a guest, since useScanHistory never records anything for one. */
  historyCount: number;
  onClearHistory: () => void;
  /** No signed-in session - the Account section offers a way out instead of
   *  the usual sign-out. */
  guest: boolean;
  onLeaveGuest: () => void;
  onClose: () => void;
}

/**
 * Preferences: language, the haptic alert, the confidence threshold a session
 * starts with, clearing local history, and signing out. Reached from the
 * camera screen's header - see DetectorScreen.
 */
export function SettingsScreen({
  settings,
  historyCount,
  onClearHistory,
  guest,
  onLeaveGuest,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { email, signOut } = useAuth();
  const { show, dismiss, visible, dialog } = useDialog();

  const confirmClearHistory = useCallback(() => {
    show({
      title: t('clearHistoryConfirmTitle'),
      message: t('clearHistoryConfirmBody', {
        count: t('scanCount', { count: historyCount }),
      }),
      actions: [
        {
          label: t('clearHistory'),
          variant: 'destructive',
          onPress: onClearHistory,
        },
        { label: t('cancelSelect'), variant: 'cancel' },
      ],
    });
  }, [historyCount, onClearHistory, show]);

  const confirmSignOut = useCallback(() => {
    if (email == null) return;
    show({
      title: t('signOutConfirmTitle'),
      message: t('signOutConfirmBody', { email }),
      actions: [
        { label: t('signOut'), variant: 'destructive', onPress: () => signOut() },
        { label: t('cancelSelect'), variant: 'cancel' },
      ],
    });
  }, [email, signOut, show]);

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      // Back unwinds in the order things were opened. This Modal owns the back
      // press while it is up, so the dialog cannot catch it itself.
      onRequestClose={visible ? dismiss : onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('settingsTitle')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            hitSlop={16}
            onPress={onClose}
          >
            <CloseIcon />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <Section title={t('languageSection')}>
            {/* Language names stay in their own language regardless of the
                active locale - "Tiếng Việt" and "English" are not translated,
                the same way a language picker never translates its own
                options anywhere else. */}
            <SegmentedTabs<Locale>
              options={[
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
              selected={locale}
              onSelect={setLocale}
            />
          </Section>

          <Section title={t('detectionSection')}>
            <Row label={t('hapticsLabel')} hint={t('hapticsHint')}>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={v => settings.update({ hapticsEnabled: v })}
                trackColor={{ true: COLORS.accent }}
              />
            </Row>
            <View style={styles.divider} />
            <Row
              label={t('defaultThresholdLabel')}
              hint={t('defaultThresholdHint')}
              stacked
            >
              <ThresholdSlider
                showIcon={false}
                live={false}
                fill
                value={settings.defaultThreshold}
                onChange={v => settings.update({ defaultThreshold: v })}
              />
            </Row>
          </Section>

          <Section title={t('dataSection')}>
            <Text style={styles.rowHint}>{t('clearHistoryHint')}</Text>
            <Pressable
              style={[styles.danger, historyCount === 0 && styles.muted]}
              accessibilityRole="button"
              disabled={historyCount === 0}
              onPress={confirmClearHistory}
            >
              <Text
                style={[styles.dangerText, historyCount === 0 && styles.mutedText]}
              >
                {t('clearHistory')}
              </Text>
            </Pressable>
          </Section>

          <Section title={t('authEyebrow')}>
            {guest ? (
              <>
                <Text style={styles.rowHint}>{t('guestModeNotice')}</Text>
                <Pressable
                  style={styles.cta}
                  accessibilityRole="button"
                  onPress={() => {
                    onLeaveGuest();
                    onClose();
                  }}
                >
                  <Text style={styles.ctaText}>{t('guestSignInCta')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {email != null && (
                  <Text style={styles.account}>{t('signedInAs', { email })}</Text>
                )}
                <Pressable
                  style={styles.danger}
                  accessibilityRole="button"
                  onPress={confirmSignOut}
                >
                  <Text style={styles.dangerText}>{t('signOut')}</Text>
                </Pressable>
              </>
            )}
          </Section>
        </ScrollView>

        {dialog}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  scroll: { paddingHorizontal: 16, gap: 22 },

  section: { gap: 10 },
  sectionTitle: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 11,
    letterSpacing: 2,
    marginLeft: 4,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 14,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // No flexDirection: the column default is the point - see Row's `stacked`.
  // The slider carries its own 12dp inset, so it lines up close enough to the
  // text above it without a margin here.
  rowStacked: { gap: 8 },
  rowText: { flex: 1, gap: 3 },
  rowLabel: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  rowHint: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.hairline,
  },

  account: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  danger: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 26,
    backgroundColor: '#FF453A',
  },
  dangerText: {
    color: '#FFFFFF',
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 26,
    backgroundColor: COLORS.accent,
  },
  ctaText: {
    color: COLORS.onAccent,
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
  muted: { backgroundColor: 'rgba(255,255,255,0.08)' },
  mutedText: { color: COLORS.textFaint },
});
