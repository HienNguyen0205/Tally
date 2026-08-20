// Runs after the test framework is installed, so `expect` exists for
// reanimated to extend.
//
// setUpTests() registers `toHaveAnimatedStyle` and `toHaveAnimatedProps`, the
// only way to read back a value that useAnimatedStyle computed - an animated
// style never lands in the rendered props tree the way a plain style does.
//
// The library itself only loads under Jest because of the resolver configured
// in jest.config.js; without it this line throws before it can register
// anything.
require('react-native-reanimated').setUpTests();
