import type { AuthError } from '@supabase/supabase-js';

import { t } from '../i18n';

/**
 * Turns a Supabase auth error into the small set of Vietnamese/English
 * sentences the rest of this app's copy already uses, rather than showing
 * gotrue's raw English message - strings.ts is explicit that developer-facing
 * text stays out of the UI, and a wrong-password message is not developer
 * text, it is the one thing the person in front of the form needs to read.
 *
 * Matching on the message string is unavoidable: gotrue does not send a stable
 * machine-readable code for most of these. Anything unrecognised falls back to
 * the generic sentence rather than the original string, so nothing
 * untranslated ever reaches the screen.
 */
export function mapAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase();

  if (msg.includes('already registered') || msg.includes('already exists')) {
    return t('authErrorExists');
  }
  if (msg.includes('invalid login credentials')) return t('authErrorBadLogin');
  if (msg.includes('password') && /at least|short|weak/.test(msg)) {
    return t('authErrorWeakPassword');
  }
  if (msg.includes('email') && msg.includes('invalid')) {
    return t('authErrorInvalidEmail');
  }
  return t('authErrorGeneric');
}

/**
 * Deliberately loose - the only job is catching a typo before spending a
 * network round trip on it. Anything stricter starts rejecting addresses that
 * are genuinely deliverable, and the authoritative check is the confirmation
 * mail landing (or not) anyway.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase's own default minimum. Checked locally so the error is instant. */
export const MIN_PASSWORD = 6;

export const isValidEmail = (email: string) => EMAIL_RE.test(email);
