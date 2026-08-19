module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Inlines .env into `import ... from '@env'` (see src/shared/supabase.ts).
    // Metro caches transforms against this file, so a change here needs
    // `npm start -- --reset-cache` or the old output keeps being served.
    ['module:react-native-dotenv'],
    // Must stay last: the worklets plugin rewrites function bodies and has to
    // see the final AST, after every other plugin has had its turn.
    ['react-native-worklets/plugin'],
  ],
};
