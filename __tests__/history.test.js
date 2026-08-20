const {
  HISTORY_LIMIT,
  WEEK_DAYS,
  addRecord,
  clockTime,
  groupByDay,
  parseHistory,
  summarise,
  totalOf,
  weekTotals,
} = require('../src/shared/history');
const { FACE_CLASS_ID } = require('../src/shared/constants');
const { t } = require('../src/i18n');

function det(score = 0.9) {
  return {
    xmin: 0,
    ymin: 0,
    xmax: 1,
    ymax: 1,
    score,
    classId: FACE_CLASS_ID,
  };
}

function rec(id, at = 0) {
  return { id, at, thumbnail: '', faces: 0 };
}

describe('summarise', () => {
  it('counts the boxes on screen', () => {
    expect(summarise([det(), det(), det()])).toEqual({ faces: 3 });
  });

  it('handles a scan that found nothing', () => {
    expect(summarise([])).toEqual({ faces: 0 });
  });
});

describe('totalOf', () => {
  function counted(id, faces) {
    return { id, at: 0, thumbnail: '', faces };
  }

  it('adds up a batch', () => {
    expect(totalOf([counted('a', 5), counted('b', 3)])).toEqual({
      faces: 8,
      photos: 2,
    });
  });

  it('is all zeroes for an empty batch', () => {
    expect(totalOf([])).toEqual({ faces: 0, photos: 0 });
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

  // Records written by the COCO build carry people/total/counts and no
  // `faces`. Reading `total` as the face count keeps that history visible
  // instead of silently dropping every scan the user remembers taking - the
  // alternative when the record shape changed under them.
  it('reads a record written before the face detector', () => {
    const legacy = {
      id: 'old',
      at: 123,
      thumbnail: '',
      people: 2,
      total: 5,
      counts: [{ classId: 0, count: 2 }],
    };

    expect(parseHistory(JSON.stringify([legacy]))).toEqual([
      { id: 'old', at: 123, thumbnail: '', faces: 5 },
    ]);
  });

  it('prefers `faces` over `total` when both are present', () => {
    const both = { id: 'x', at: 1, thumbnail: '', faces: 4, total: 9 };
    expect(parseHistory(JSON.stringify([both]))[0].faces).toBe(4);
  });

  it('drops a record carrying neither count', () => {
    const neither = { id: 'x', at: 1, thumbnail: '' };
    expect(parseHistory(JSON.stringify([neither]))).toEqual([]);
  });
});

// Asserted against `t` rather than literal text: the wording depends on the
// device language, and what actually needs pinning is which unit gets picked at
// each boundary.

// Local midnights, so these read the same in any timezone the suite runs in.
function ts(y, m, d, hh = 12, mm = 0) {
  return new Date(y, m - 1, d, hh, mm).getTime();
}

describe('clockTime', () => {
  it('pads to HH:MM', () => {
    expect(clockTime(ts(2026, 8, 18, 9, 5))).toBe('09:05');
    expect(clockTime(ts(2026, 8, 18, 23, 59))).toBe('23:59');
  });
});

describe('groupByDay', () => {
  const now = ts(2026, 8, 18, 10, 0);

  it('names today and yesterday, and dates the rest', () => {
    const sections = groupByDay(
      [
        rec('a', ts(2026, 8, 18, 9)),
        rec('b', ts(2026, 8, 17, 9)),
        rec('c', ts(2026, 8, 15, 9)),
      ],
      now,
    );

    expect(sections.map(s => s.title)).toEqual([t('today'), t('yesterday'), '15/8/2026']);
  });

  it('keeps several scans from one day in one section', () => {
    const sections = groupByDay(
      [rec('a', ts(2026, 8, 18, 9)), rec('b', ts(2026, 8, 18, 8))],
      now,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].data.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('cuts the day at local midnight, not UTC', () => {
    // 23:30 local is already the next UTC day east of Greenwich. Dividing the
    // timestamp by 86400000 would file this under tomorrow.
    const sections = groupByDay([rec('a', ts(2026, 8, 18, 23, 30))], now);
    expect(sections[0].title).toBe(t('today'));
  });

  it('returns nothing for an empty history', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('weekTotals', () => {
  const now = ts(2026, 8, 18, 10, 0);

  function scan(at, faces) {
    return { id: String(at), at, thumbnail: '', faces };
  }

  it('adds up every scan inside the window', () => {
    expect(
      weekTotals([scan(ts(2026, 8, 18, 9), 3), scan(ts(2026, 8, 16, 9), 2)], now),
    ).toEqual({ faces: 5, photos: 2 });
  });

  // The window is a rolling WEEK_DAYS ending today, so the oldest day it can
  // include is 6 days back - and the day before that must fall outside.
  it('includes the whole first day of the window and excludes the day before', () => {
    const oldest = ts(2026, 8, 18 - (WEEK_DAYS - 1), 0, 1);
    const tooOld = ts(2026, 8, 18 - WEEK_DAYS, 23, 59);

    expect(weekTotals([scan(oldest, 1)], now).photos).toBe(1);
    expect(weekTotals([scan(tooOld, 1)], now).photos).toBe(0);
  });

  it('counts from local midnight, so a scan earlier today is always in', () => {
    expect(weekTotals([scan(ts(2026, 8, 18, 0, 1), 7)], now)).toEqual({
      faces: 7,
      photos: 1,
    });
  });

  it('is empty when nothing is recent', () => {
    expect(weekTotals([scan(ts(2026, 1, 1), 9)], now)).toEqual({
      faces: 0,
      photos: 0,
    });
  });
});
