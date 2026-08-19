import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

import { COLORS, FONT } from '../shared/theme';
import { locale, setLocale, t, type Locale } from '../i18n';
import { Icon } from './icons';

/** Shared with the corner button in AuthScreen, so the flag shown there and
 *  the flag shown in this list are always the same glyph. */
export const LOCALE_FLAG: Record<Locale, string> = {
  vi: '🇻🇳',
  en: '🇬🇧',
};

const OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

interface Props {
  sheetRef: RefObject<TrueSheet | null>;
}

/**
 * The language picker, presented as a native bottom sheet from the button in
 * AuthScreen's top-right corner.
 *
 * A sheet rather than a control sitting in the form, the way SettingsScreen's
 * SegmentedTabs does it: AuthScreen has no spare room for a second row of
 * controls above the form, and this needs to be reachable before signing in,
 * not just after.
 */
export function LanguageSheet({ sheetRef }: Props) {
  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      backgroundColor="#0B0C0E"
      cornerRadius={28}
      grabberOptions={{ color: COLORS.hairline, adaptive: false }}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{t('languageSection')}</Text>

        {OPTIONS.map(option => {
          const selected = locale === option.value;
          return (
            <Pressable
              key={option.value}
              style={styles.row}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                // Language names are never translated (see the same note in
                // SettingsScreen) - "Tiếng Việt" reads the same regardless of
                // which one is currently active.
                setLocale(option.value);
                sheetRef.current?.dismiss();
              }}
            >
              <View style={styles.rowStart}>
                <Text style={styles.flag}>{LOCALE_FLAG[option.value]}</Text>
                <Text style={[styles.label, selected && styles.labelSelected]}>
                  {option.label}
                </Text>
              </View>
              {selected && (
                <Icon name="check" size={18} color={COLORS.accent} strokeWidth={2} />
              )}
            </Pressable>
          );
        })}
      </View>
    </TrueSheet>
  );
}

const styles = StyleSheet.create({
  // The grabber is a native overlay drawn on top of the sheet's content
  // rather than a view that reserves its own layout space (its hitbox runs
  // to ~36dp on Android, ~20pt on iOS) - paddingTop has to clear that itself
  // or the title sits underneath it.
  content: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 28, gap: 4 },
  title: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flag: { fontSize: 20 },
  label: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 15,
  },
  labelSelected: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
  },
});
