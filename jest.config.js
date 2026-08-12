module.exports = {
  preset: '@react-native/jest-preset',
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
};
