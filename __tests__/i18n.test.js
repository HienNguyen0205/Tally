const { t, locale } = require('../src/i18n');
const { vi, PLURAL_KEYS } = require('../src/i18n/vi');
const { en } = require('../src/i18n/en');
const { labelForCount } = require('../src/shared/labels');

// The Params interface in vi.ts is the compile-time contract; TypeScript
// enforces that callers pass the right arguments. What it cannot check is that
// a placeholder inside the string spells the same name, that it uses i18n-js's
// `%{x}` rather than a JS template `${x}`, or that a plural key's English
// actually inflects - all three ship a visibly broken or ungrammatical sentence
// with no error anywhere. Hence this file.
//
// Nothing here asserts Vietnamese or English text: the active locale comes
// from the environment (jest resolves to en, a Vietnamese phone to vi), so a
// test pinned to one language passes or fails by accident of where it runs.
const active = locale === 'vi' ? vi : en;

/**
 * Every key that takes arguments, with one count that exercises the 'other'
 * plural form and, for plural keys, a second that exercises 'one'.
 */
const INTERPOLATED = [
  ['zoomTimes', { count: 3 }],
  ['scanningProgress', { done: 2, total: 5 }],
  ['classCount', { count: 7 }],
  ['classCountPartial', { shown: 3, count: 7 }],
  ['classChip', { name: 'thuyền', count: 4 }],
  ['boxLabel', { name: 'thuyền', percent: 64 }],
  ['percent', { n: 64 }],
  ['limitedNotice', { count: 12 }],
  ['scanSelected', { count: 12 }],
  ['deleteSelected', { n: 8 }],
  ['signOutConfirmBody', { email: 'a@b.co' }],
  ['confirmEmailSent', { email: 'a@b.co' }],
  ['batchTitle', { count: 9 }],
  ['batchTotal', { people: '3 people', total: '11 objects' }],
  ['peopleCount', { count: 3 }],
  ['objectCount', { count: 11 }],
  ['countOf', { count: 4, name: 'thuyền' }],
  ['sumPhotos', { count: 9 }],
  ['scanCount', { count: 5 }],
  ['clearHistoryConfirmBody', { count: '5 scans' }],
  ['signedInAs', { email: 'a@b.co' }],
];

describe('t()', () => {
  it('reads from the catalog the detected locale selected', () => {
    // Catches an I18n instance wired to the wrong catalog, which would
    // otherwise only show up as the whole app rendering in one language.
    expect(t('close')).toBe(active.close);
    expect(t('historyTitle')).toBe(active.historyTitle);
  });

  it('substitutes every argument it is given', () => {
    for (const [key, params] of INTERPOLATED) {
      const out = t(key, params);
      for (const value of Object.values(params)) {
        // A `${x}` placeholder leaves the value out entirely; a misspelled
        // `%{y}` leaves the marker behind. Both fail here.
        expect(out).toContain(String(value));
      }
      expect(out).not.toMatch(/%\{|\$\{|\[missing|\bone\b.*\bother\b/);
    }
  });

  it('leaves a plain string untouched', () => {
    expect(t('close')).not.toMatch(/%\{|\$\{|\[missing/);
  });
});

describe('pluralisation', () => {
  it('resolves a distinct form for 1 vs. other counts, in English', () => {
    // Vietnamese does not inflect, so this only means something for en - see
    // the "does not inflect" test below for the vi side of the same fact.
    if (locale !== 'en') return;
    for (const key of PLURAL_KEYS) {
      const params = key === 'classChip' ? { name: 'x' } : {};
      const one = t(key, { ...params, count: 1 });
      const many = t(key, { ...params, count: 3 });
      expect(one).not.toBe(many);
    }
  });

  it('does not inflect Vietnamese for count', () => {
    for (const key of PLURAL_KEYS) {
      // vi values are plain strings by construction (see vi.ts) - a plural key
      // that gained {one, other} forms there would be lying about the
      // language, so this fails loudly instead of silently duplicating text.
      expect(typeof vi[key]).toBe('string');
    }
  });

  it('gives every plural key exactly {one, other} in English, and only those keys', () => {
    const objectValued = Object.keys(en).filter(k => typeof en[k] === 'object');
    expect(objectValued.sort()).toEqual([...PLURAL_KEYS].sort());
    for (const key of PLURAL_KEYS) {
      expect(Object.keys(en[key]).sort()).toEqual(['one', 'other']);
    }
  });
});

describe('catalogs', () => {
  it('cover exactly the same keys', () => {
    // TypeScript already fails the build on a missing translation, but only for
    // code it typechecks - this also holds if the catalogs are edited as JS.
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });

  it('agree on which placeholders each key uses', () => {
    const placeholders = s => (s.match(/%\{(\w+)\}/g) ?? []).sort();
    // English plural keys carry their placeholders inside {one, other} rather
    // than directly on the catalog value - collapse both forms down to the
    // union of placeholders they use before comparing to vi's single string.
    const placeholdersOf = value =>
      typeof value === 'string'
        ? placeholders(value)
        : [...new Set([...placeholders(value.one), ...placeholders(value.other)])].sort();

    for (const key of Object.keys(vi)) {
      expect(placeholdersOf(en[key])).toEqual(placeholders(vi[key]));
    }
  });

  it('declares params for exactly the keys that interpolate', () => {
    const declared = INTERPOLATED.map(([key]) => key).sort();
    const found = Object.keys(vi)
      .filter(k => /%\{/.test(vi[k]))
      .sort();
    expect(declared).toEqual(found);
  });
});

describe('labelForCount', () => {
  // classId 0 is 'person' in COCO - the one irregular plural that would slip
  // past a naive "+s" rule silently, so it is worth pinning by name.
  const PERSON = 0;
  // A regular noun, to confirm the common case still gets an 's'.
  const BOAT = 8;

  it('does not inflect in Vietnamese', () => {
    if (locale !== 'vi') return;
    expect(labelForCount(PERSON, 1)).toBe(labelForCount(PERSON, 3));
    expect(labelForCount(BOAT, 1)).toBe(labelForCount(BOAT, 3));
  });

  it('inflects irregular and regular nouns correctly in English', () => {
    if (locale !== 'en') return;
    expect(labelForCount(PERSON, 1)).toBe('person');
    expect(labelForCount(PERSON, 3)).toBe('people');
    expect(labelForCount(BOAT, 1)).toBe('boat');
    expect(labelForCount(BOAT, 3)).toBe('boats');
  });
});
