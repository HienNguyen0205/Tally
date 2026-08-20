const { toCsv } = require('../src/shared/export');

function rec(at, faces) {
  return { id: String(at), at, thumbnail: '', faces };
}

// The COCO build wrote one row per class per scan, with `class` and `count`
// columns. A single-class detector has exactly one number per scan, so the
// shape collapsed to one row each - see toCsv's own note.
describe('toCsv', () => {
  it('writes a header even with no records', () => {
    expect(toCsv([])).toBe('time,faces');
  });

  it('writes one row per scan', () => {
    const csv = toCsv([rec(0, 3), rec(1000, 5)]);

    expect(csv.split('\n')).toEqual([
      'time,faces',
      '1970-01-01T00:00:00.000Z,3',
      '1970-01-01T00:00:01.000Z,5',
    ]);
  });

  // "We looked and saw none" has to survive the export - dropping the row
  // would make an empty scan indistinguishable from one never taken.
  it('keeps a scan that found nothing', () => {
    expect(toCsv([rec(0, 0)])).toContain('1970-01-01T00:00:00.000Z,0');
  });

  // ISO, not a local format: it sorts as text, and a spreadsheet opened in
  // another timezone still shows the moment the scan happened.
  it('writes the time as ISO 8601', () => {
    const csv = toCsv([rec(Date.UTC(2026, 7, 20, 9, 30), 1)]);
    expect(csv).toContain('2026-08-20T09:30:00.000Z,1');
  });
});
