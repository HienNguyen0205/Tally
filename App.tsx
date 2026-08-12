import React from 'react';
import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DetectorScreen } from './src/screens/DetectorScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Camera tràn viền: thanh trạng thái trong suốt để ảnh chạy lên sát đỉnh,
          HUD tự né vùng an toàn bằng khoảng đệm riêng. */}
      <RNStatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.root}>
        <DetectorScreen />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
});
