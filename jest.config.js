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
  //
  // react-native-true-sheet does need one - unlike MMKV it has no built-in
  // Jest auto-detection, and ships its mock behind an opt-in `/mock` subpath
  // instead (see AuthScreen.tsx, LanguageSheet.tsx). No test imports either
  // file yet, but a Jest run without this would fail the moment one does.
  moduleNameMapper: {
    '^@lodev09/react-native-true-sheet$':
      '@lodev09/react-native-true-sheet/mock',
  },
  // Anything importing reanimated - which is very nearly every component -
  // used to die at require time on
  // "Cannot read properties of undefined (reading 'loadUnpackersWithCode')".
  // reanimated pulls in react-native-worklets, whose NativeWorklets.native.ts
  // calls into the native module as an import-time side effect, and under Jest
  // there is no binary registered to answer.
  //
  // This resolver ships with react-native-worklets for exactly that: it drops
  // the `.native` extensions when resolving inside the package, so Jest picks
  // NativeWorklets.ts over NativeWorklets.native.ts and the native call is
  // never reached. Preferred over mapping reanimated to its own `mock` module,
  // which would swap the whole library for no-ops - the real one loads fine
  // once worklets stops reaching for the binary, so animated components can be
  // rendered and asserted on rather than stubbed out.
  resolver: 'react-native-worklets/jest/resolver.js',
  // Registers reanimated's `toHaveAnimatedStyle` / `toHaveAnimatedProps`
  // matchers and puts animations on a fake clock.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
