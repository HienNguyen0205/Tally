import { useCallback, useEffect, useState } from 'react';
import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DetectorScreen } from './src/screens/DetectorScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { LaunchScreen } from './src/components/LaunchScreen';
import { useAuth } from './src/hooks/useAuth';
import { useSettings } from './src/hooks/useSettings';
import { hasEnrolled } from './src/shared/faceProfiles';
import { t, useLocale } from './src/i18n';

/**
 * The gate: no camera, no history, nothing else in the app is reachable
 * without a real signed-in Supabase session - unless `guestMode` is set, in
 * which case the camera is reachable but useScanHistory (see DetectorScreen)
 * disables every write, local and cloud alike. `loading` covers the moment
 * before the first session check resolves - reusing LaunchScreen there
 * rather than a blank frame, since it already exists for exactly this kind
 * of "something is being checked, do not flash empty" beat.
 *
 * Settings and the saved locale need no such gate any more: both read MMKV
 * synchronously (useSettings' initial state, and the module-level override
 * applied at the top of i18n/index.ts before anything renders), so there is
 * nothing left to wait on there - unlike the AsyncStorage-backed version of
 * this file, which awaited both before ever rendering DetectorScreen.
 */
function Root() {
  const { loading, email } = useAuth();
  const settings = useSettings();
  // Not persisted on purpose: guest mode saves nothing, so there is nothing
  // for a cold start to remember either - every launch re-asks, same as it
  // would for someone who has never opened the app before.
  const [guestMode, setGuestMode] = useState(false);

  // 'checking' until Supabase answers, so the camera does not flash up for a
  // moment before the enrolment step replaces it. 'settled' also covers
  // skipping: the step is an offer, not a wall - someone who declines still
  // gets the app, they just never match on anyone's scan.
  const [enrolment, setEnrolment] = useState<
    'checking' | 'needed' | 'settled'
  >('checking');

  const checkEnrolment = useCallback(async () => {
    if (email == null) {
      setEnrolment('checking');
      return;
    }
    try {
      setEnrolment((await hasEnrolled()) ? 'settled' : 'needed');
    } catch (e) {
      // Offline, or the table has not been created yet (see
      // supabase/face_profiles.sql). Either way, do not block the camera
      // behind a step that cannot succeed.
      console.warn('[App] could not check face enrolment', e);
      setEnrolment('settled');
    }
  }, [email]);

  useEffect(() => {
    checkEnrolment();
  }, [checkEnrolment]);

  // Subscribed only so a call to setLocale() (from SettingsScreen) forces this
  // component to re-render - nothing here reads the return value. Since
  // nothing in this codebase memoises with React.memo, that re-render cascades
  // to every descendant, and every t() call along the way picks up the new
  // language on its next pass. See src/i18n/index.ts.
  useLocale();

  if (loading) return <LaunchScreen status={t('loadingAccount')} />;

  if (email == null && !guestMode) {
    return <AuthScreen onContinueAsGuest={() => setGuestMode(true)} />;
  }

  return (
    <DetectorScreen
      settings={settings}
      // A real session always wins, even with leftover guestMode state - the
      // only way in here with `email == null` is guestMode already being
      // true, but deriving it from `email` rather than trusting the flag
      // means a session that appears mid-guest-session (signing in from
      // Settings) turns history writes back on the moment it lands, with no
      // extra plumbing to reset the flag itself.
      guest={email == null}
      onLeaveGuest={() => setGuestMode(false)}
      // Enrolment is rendered by DetectorScreen rather than swapped in here:
      // it needs the three models and the running camera, and loading a second
      // set of those is what ran the heap out of memory.
      needsEnrolment={email != null && enrolment === 'needed'}
      onEnrolmentSettled={() => setEnrolment('settled')}
      // Straight back to 'needed': the overlay is driven by this one flag, so
      // asking to scan again is the same state the app starts a new account in.
      onReEnrol={() => setEnrolment('needed')}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Camera tràn viền: thanh trạng thái trong suốt để ảnh chạy lên sát đỉnh,
          HUD tự né vùng an toàn bằng khoảng đệm riêng. */}
      <RNStatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.root}>
        <Root />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
});
