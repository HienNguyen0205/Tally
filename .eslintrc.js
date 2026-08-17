module.exports = {
  root: true,
  extends: '@react-native',
  // .bundle/config points BUNDLE_PATH at vendor/bundle, so `bundle install`
  // drops Ruby gems inside the project - and RDoc ships browser JS templates
  // that ESLint would otherwise lint as if they were ours.
  ignorePatterns: ['vendor/'],
};
