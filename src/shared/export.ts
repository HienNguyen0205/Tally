import { label } from './labels';
import type { ScanRecord } from './history';

/**
 * The history as CSV, newest first.
 *
 * The app is a tally and the numbers were trapped inside it - there was no way
 * to get a count out to a spreadsheet, which is where counting work ends up.
 *
 * One row per class per scan (tidy data): a scan is a variable number of
 * classes, so a column per class would mean a different header for every export
 * and would break a pivot table. A scan that found nothing still gets a row,
 * with the class columns empty, so "we looked and saw none" survives the export.
 *
 * Column names stay English - they are keys a formula refers to, not prose -
 * while the class values use the same localised names the app shows.
 */
function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(records: readonly ScanRecord[]): string {
  const rows = [['time', 'people', 'total', 'class', 'count']];

  for (const r of records) {
    // ISO rather than a local format: it sorts as text, and a spreadsheet
    // opened in another timezone still shows the moment the scan happened.
    const at = new Date(r.at).toISOString();
    const head = [at, String(r.people), String(r.total)];

    if (r.counts.length === 0) {
      rows.push([...head, '', '']);
      continue;
    }
    for (const c of r.counts) {
      rows.push([...head, label(c.classId), String(c.count)]);
    }
  }

  return rows.map(row => row.map(cell).join(',')).join('\n');
}
