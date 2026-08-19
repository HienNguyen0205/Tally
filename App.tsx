import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DetectorScreen } from './src/screens/DetectorScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { LaunchScreen } from './src/components/LaunchScreen';
import { useAuth } from './src/hooks/useAuth';
import { useSettings } from './src/hooks/useSettings';
import { t, useLocale } from './src/i18n';

/**
 * The gate: no camera, no history, nothing else in the app is reachable
 * without a real signed-in Supabase session. `loading` covers the moment
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

  // Subscribed only so a call to setLocale() (from SettingsScreen) forces this
  // component to re-render - nothing here reads the return value. Since
  // nothing in this codebase memoises with React.memo, that re-render cascades
  // to every descendant, and every t() call along the way picks up the new
  // language on its next pass. See src/i18n/index.ts.
  useLocale();

  if (loading) return <LaunchScreen status={t('loadingAccount')} />;
  return email != null ? (
    <DetectorScreen settings={settings} />
  ) : (
    <AuthScreen />
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
