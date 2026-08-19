const React = require('react');
const TestRenderer = require('react-test-renderer');
const { Text } = require('react-native');

// i18n.test.js treats `locale` as a fixed snapshot for the whole suite - it
// only ever reads what the environment resolved at require time. This file is
// the one place that actually calls setLocale() and checks the runtime
// switching machinery itself: the live `locale` binding other modules read
// (labels.ts), the preference applied at module load, and the React
// re-render that setLocale does not trigger by itself. Kept separate on
// purpose, since mutating locale mid-suite would make i18n.test.js's
// assumptions stale for every test that runs after it.

test('setLocale switches t() output and the live `locale` binding other modules read', () => {
  const i18n = require('../src/i18n');
  const { labelForCount } = require('../src/shared/labels');

  i18n.setLocale('en');
  expect(i18n.t('close')).toBe('Close');
  expect(i18n.locale).toBe('en');
  expect(labelForCount(0, 3)).toBe('people'); // labels.ts imports `locale` live

  i18n.setLocale('vi');
  expect(i18n.t('close')).toBe('Đóng');
  expect(i18n.locale).toBe('vi');
  expect(labelForCount(0, 3)).toBe('người');
});

test('applies a locale saved in an earlier session, at module load', () => {
  // i18n/index.ts reads the override synchronously as top-level module code -
  // there is no separate "load" function to call any more (MMKV made it
  // unnecessary, see App.tsx). Reproducing "an earlier session saved a
  // preference" therefore means writing the key and then re-requiring the
  // module fresh, as a real app start would.
  //
  // jest.isolateModules(), not jest.resetModules(): the latter also resets
  // 'react' for every later require() in this file, and React breaks (a null
  // hooks dispatcher) the moment two different module instances of 'react'
  // end up in the same render tree - which is exactly what the last test
  // below does via TestRenderer. isolateModules scopes the reset to only
  // what the callback requires, then restores the outer registry.
  let locale;
  jest.isolateModules(() => {
    require('../src/shared/storage').storage.set('tally.locale.override', 'en');
    locale = require('../src/i18n').locale;
  });
  expect(locale).toBe('en');
});

test('ignores a corrupted or unrecognised stored value', () => {
  let locale;
  jest.isolateModules(() => {
    require('../src/shared/storage').storage.set('tally.locale.override', 'fr');
    locale = require('../src/i18n').locale;
  });
  // Falls back to whatever Intl detects in this environment, not the garbage
  // value - 'fr' was never one of the two locales this app ships.
  expect(locale).not.toBe('fr');
  expect(['vi', 'en']).toContain(locale);
});

test('useLocale re-renders its subscriber when the locale changes, with no props or context', () => {
  const i18n = require('../src/i18n');
  i18n.setLocale('vi');

  function Probe() {
    i18n.useLocale();
    return React.createElement(Text, null, i18n.t('close'));
  }

  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  expect(renderer.toJSON().children).toEqual(['Đóng']);

  TestRenderer.act(() => {
    i18n.setLocale('en');
  });
  expect(renderer.toJSON().children).toEqual(['Close']);

  TestRenderer.act(() => {
    renderer.unmount();
  });
});
