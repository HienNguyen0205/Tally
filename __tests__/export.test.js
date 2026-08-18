const { toCsv } = require('../src/shared/export');
const { label } = require('../src/shared/labels');
const { PERSON_CLASS_ID } = require('../src/shared/constants');

const BOAT = 8;

function rec(at, people, total, counts) {
  return { id: String(at), at, thumbnail: '', people, total, counts };
}

describe('toCsv', () => {
  it('writes a header even with no records', () => {
    expect(toCsv([])).toBe('time,people,total,class,count');
  });

  it('writes one row per class in a scan', () => {
    const csv = toCsv([
      rec(0, 3, 5, [
        { classId: PERSON_CLASS_ID, count: 3 },
        { classId: BOAT, count: 2 },
      ]),
    ]);

    expect(csv.split('\n')).toEqual([
      'time,people,total,class,count',
      `1970-01-01T00:00:00.000Z,3,5,${label(PERSON_CLASS_ID)},3`,
      `1970-01-01T00:00:00.000Z,3,5,${label(BOAT)},2`,
    ]);
  });

  it('keeps a scan that found nothing', () => {
    expect(toCsv([rec(0, 0, 0, [])])).toContain(
      '1970-01-01T00:00:00.000Z,0,0,,',
    );
  });

  it('renders an unknown class id rather than dropping the row', () => {
    const csv = toCsv([rec(0, 0, 1, [{ classId: 999, count: 1 }])]);
    expect(csv).toContain(',#999,1');
  });
});
