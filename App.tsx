import React from 'react';
import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DetectorScreen } from './src/screens/DetectorScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { LaunchScreen } from './src/components/LaunchScreen';
import { useAuth } from './src/hooks/useAuth';
import { t } from './src/i18n';

/**
 * The gate: no camera, no history, nothing else in the app is reachable
 * without a real signed-in Supabase session. `loading` covers the moment
 * before the first session check resolves - reusing LaunchScreen there
 * rather than a blank frame, since it already exists for exactly this kind
 * of "something is being checked, do not flash empty" beat.
 */
function Root() {
  const { loading, email } = useAuth();

  if (loading) return <LaunchScreen status={t('loadingAccount')} />;
  return email != null ? <DetectorScreen /> : <AuthScreen />;
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
