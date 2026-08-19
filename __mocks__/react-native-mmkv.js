// Jest applies this automatically for any `require('react-native-mmkv')` in
// the whole project - no `jest.mock()` call needed, since it lives in
// `__mocks__` adjacent to `node_modules` (Jest's documented convention for
// node_modules packages).
//
// The real package claims to auto-detect a test environment (see its own
// `isTest()`/`createMockMMKV`), but that check runs too late: `createMMKV.js`
// unconditionally imports `getMMKVFactory.js`, which imports
// `react-native-nitro-modules`, which touches `TurboModuleRegistry` as an
// IMPORT-TIME side effect - before `isTest()` ever runs. Under Jest, with no
// native binary registered, that throws "NitroModules could not be found"
// regardless of which branch createMMKV() would have taken. This mock never
// imports the real package at all, so that chain never runs.
//
// Only `createMMKV` is implemented: it is the only export this project calls
// (see shared/storage.ts). Add more as needed rather than up front.
function createMMKV() {
  // Persisted on `global`, not module scope: `jest.resetModules()` clears the
  // require cache - which would otherwise wipe a module-scoped Map too - but a
  // real MMKV file survives a JS module reload. i18nRuntime.test.js resets
  // modules deliberately to simulate a fresh app start reading a preference an
  // earlier "session" saved, and needs the data to actually survive that.
  if (global.__mmkvMockStore == null) global.__mmkvMockStore = new Map();
  const map = global.__mmkvMockStore;
  return {
    getString: key => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    remove: key => map.delete(key),
    getAllKeys: () => [...map.keys()],
    contains: key => map.has(key),
    clearAll: () => map.clear(),
  };
}

module.exports = { createMMKV };
