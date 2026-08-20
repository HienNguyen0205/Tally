import type { ScanRecord } from './history';

/**
 * The history as CSV, newest first.
 *
 * The app is a tally and the numbers were trapped inside it - there was no way
 * to get a count out to a spreadsheet, which is where counting work ends up.
 *
 * One row per scan. The COCO build wrote one row per class per scan, with
 * `class` and `count` columns, because a scan held a variable number of
 * classes; a single-class detector has exactly one number per scan, so that
 * shape would now mean a constant column repeating "face" on every line.
 *
 * Column names stay English - they are keys a formula refers to, not prose.
 */
function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(records: readonly ScanRecord[]): string {
  const rows = [['time', 'faces']];

  for (const r of records) {
    // ISO rather than a local format: it sorts as text, and a spreadsheet
    // opened in another timezone still shows the moment the scan happened.
    rows.push([new Date(r.at).toISOString(), String(r.faces)]);
  }

  return rows.map(row => row.map(cell).join(',')).join('\n');
}
