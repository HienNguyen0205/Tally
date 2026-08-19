module.exports = {
  preset: '@react-native/jest-preset',
  // Watchman hay không spawn được trên Windows và jest chết hẳn chứ không tự
  // lùi về cách quét thư mục thường. Dự án nhỏ nên không cần watchman.
  watchman: false,
  // Các thư viện native trong dự án (reanimated, worklets, skia, vision-camera,
  // nitro, blur, camera-roll) đều ship ESM. Mặc định jest bỏ qua toàn bộ
  // node_modules nên gặp `import` là chết - phải cho transform đúng nhóm này.
  //
  // Lưu ý hai cái bẫy: KHÔNG đặt `/` sau `react-native` (sẽ trượt
  // `react-native-reanimated`), và phải chấp nhận cả `\` vì đường dẫn trên
  // Windows dùng dấu này.
  transformIgnorePatterns: [
    'node_modules[/\\\\](?!(?:@react-native|@shopify|react-native))',
  ],
  // No moduleNameMapper for storage: react-native-mmkv's createMMKV() detects
  // JEST_WORKER_ID itself and returns an in-memory mock automatically (see
  // node_modules/react-native-mmkv/lib/createMMKV/createMMKV.js). The old
  // AsyncStorage-backed version of this file needed one, since that package's
  // real native module throws under Jest with no device to back it.
};
