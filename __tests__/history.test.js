const {
  HISTORY_LIMIT,
  addRecord,
  parseHistory,
  relativeTime,
  summarise,
  totalOf,
} = require('../src/shared/history');
const { PERSON_CLASS_ID } = require('../src/shared/constants');
const { t } = require('../src/shared/strings');

const BOAT = 8;

function det(classId, score = 0.9) {
  return { xmin: 0, ymin: 0, xmax: 1, ymax: 1, score, classId };
}

function rec(id, at = 0) {
  return { id, at, thumbnail: '', people: 0, total: 0, counts: [] };
}

describe('summarise', () => {
  it('counts people separately from the total', () => {
    const s = summarise([
      det(PERSON_CLASS_ID),
      det(PERSON_CLASS_ID),
      det(BOAT),
    ]);
    expect(s.people).toBe(2);
    expect(s.total).toBe(3);
  });

  it('groups by class, most common first', () => {
    const s = summarise([det(BOAT), det(PERSON_CLASS_ID), det(BOAT)]);
    expect(s.counts).toEqual([
      { classId: BOAT, count: 2 },
      { classId: PERSON_CLASS_ID, count: 1 },
    ]);
  });

  it('handles a scan that found nothing', () => {
    expect(summarise([])).toEqual({ people: 0, total: 0, counts: [] });
  });
});

describe('totalOf', () => {
  function counted(id, people, total) {
    return { id, at: 0, thumbnail: '', people, total, counts: [] };
  }

  it('adds up a batch', () => {
    expect(totalOf([counted('a', 2, 5), counted('b', 1, 3)])).toEqual({
      people: 3,
      total: 8,
      photos: 2,
    });
  });

  it('is all zeroes for an empty batch', () => {
    expect(totalOf([])).toEqual({ people: 0, total: 0, photos: 0 });
  });
});

describe('addRecord', () => {
  it('puts the newest scan first', () => {
    const out = addRecord([rec('old')], rec('new'));
    expect(out.map(r => r.id)).toEqual(['new', 'old']);
  });

  it('drops the oldest once full, keeping the cap', () => {
    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => rec(`r${i}`));
    const out = addRecord(full, rec('newest'));

    expect(out).toHaveLength(HISTORY_LIMIT);
    expect(out[0].id).toBe('newest');
    expect(out.some(r => r.id === `r${HISTORY_LIMIT - 1}`)).toBe(false);
  });

  it('does not mutate the list it was given', () => {
    const before = [rec('a')];
    addRecord(before, rec('b'));
    expect(before.map(r => r.id)).toEqual(['a']);
  });
});

// Storage outlives the code that wrote it. Anything unreadable has to degrade
// to "no history" rather than throw on the first render after an update.
describe('parseHistory', () => {
  it('returns empty for missing or blank storage', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory(undefined)).toEqual([]);
    expect(parseHistory('')).toEqual([]);
  });

  it('returns empty for malformed JSON instead of throwing', () => {
    expect(parseHistory('{"broken":')).toEqual([]);
    expect(parseHistory('not json at all')).toEqual([]);
  });

  it('returns empty when the payload is not an array', () => {
    expect(parseHistory('{"id":"x"}')).toEqual([]);
    expect(parseHistory('42')).toEqual([]);
  });

  it('drops entries that do not match the record shape', () => {
    const raw = JSON.stringify([rec('good'), { id: 'bad' }, null, 7]);
    expect(parseHistory(raw).map(r => r.id)).toEqual(['good']);
  });

  it('enforces the cap on oversized stored data', () => {
    const raw = JSON.stringify(
      Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => rec(`r${i}`)),
    );
    expect(parseHistory(raw)).toHaveLength(HISTORY_LIMIT);
  });

  it('round-trips what addRecord produced', () => {
    const built = addRecord([], rec('a', 123));
    expect(parseHistory(JSON.stringify(built))).toEqual(built);
  });
});

// Asserted against `t` rather than literal text: the wording depends on the
// device language, and what actually needs pinning is which unit gets picked at
// each boundary.
describe('relativeTime', () => {
  const NOW = 1_000_000_000;

  it('reads as just now under a minute', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe(t.justNow);
  });

  it('switches unit at each boundary', () => {
    expect(relativeTime(NOW - 60_000, NOW)).toBe(t.minutesAgo(1));
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe(t.hoursAgo(1));
    expect(relativeTime(NOW - 86_400_000, NOW)).toBe(t.daysAgo(1));
  });

  it('rounds down within a unit rather than up', () => {
    expect(relativeTime(NOW - 119_000, NOW)).toBe(t.minutesAgo(1));
  });

  // Device clocks move backwards - NTP corrections, manual changes, timezone
  // edits. A record must never read as "-3 minutes ago".
  it('clamps a timestamp from the future to just now', () => {
    expect(relativeTime(NOW + 500_000, NOW)).toBe(t.justNow);
  });
});
