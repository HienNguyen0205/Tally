import type { Detection } from './detections';
import { t } from '../i18n';

export interface ScanRecord {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  /** Base64 JPEG, no data: prefix. Small enough to sit in key-value storage. */
  thumbnail: string;
  /**
   * How many faces this scan counted.
   *
   * One number, not the old `people` / `total` / `counts[]` trio: the detector
   * is single-class now, so "people" and "total" were always the same figure
   * and the per-class breakdown always had exactly one row.
   */
  faces: number;
}

/**
 * How many scans to keep. Each record carries a ~4KB thumbnail, so 50 lands
 * around 200KB - well inside reason for a JSON blob parsed on every launch,
 * regardless of the previews that live outside this list (see previewKey in
 * useScanHistory.ts).
 */
export const HISTORY_LIMIT = 50;

/** Collapses the boxes on screen into the number a history row shows. */
export function summarise(visible: Detection[]): { faces: number } {
  return { faces: visible.length };
}

/**
 * Adds up several scans - the point of scanning a batch is the combined figure,
 * which no single record holds.
 */
export function totalOf(records: readonly ScanRecord[]): {
  faces: number;
  photos: number;
} {
  return {
    faces: records.reduce((n, r) => n + r.faces, 0),
    photos: records.length,
  };
}

/** Newest first, oldest dropped once the list is full. */
export function addRecord(
  history: readonly ScanRecord[],
  record: ScanRecord,
): ScanRecord[] {
  return [record, ...history].slice(0, HISTORY_LIMIT);
}

/** Local midnight for a timestamp - the key a day section groups on. */
function dayKey(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many days the rolling summary covers, today included. */
export const WEEK_DAYS = 7;

/**
 * Totals across the last week, for the strip above the history list.
 *
 * A rolling seven days from this morning, not a calendar week: the question
 * being answered is "how much have I counted lately", and a Monday reset
 * would blank that out every week for someone who counts on weekends.
 *
 * Counted back with `setDate` rather than subtracting 6 * 86400000, for the
 * same reason groupByDay does: a day is not always 24 hours across a DST
 * shift, and the window would drift by an hour into the wrong day.
 */
export function weekTotals(
  records: readonly ScanRecord[],
  now: number,
): { faces: number; photos: number } {
  const from = new Date(dayKey(now));
  from.setDate(from.getDate() - (WEEK_DAYS - 1));
  const start = from.getTime();

  return totalOf(records.filter(r => r.at >= start));
}

/**
 * "09:22" - when in the day a scan happened.
 *
 * The day itself comes from the section header above the row, so repeating it
 * per row ("3 ngày trước" under a heading that already says the date) only
 * takes space. Built from Date getters rather than toLocaleTimeString: Intl is
 * compiled out of some Hermes builds, and 24-hour HH:MM needs no locale data.
 */
export function clockTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

export interface DaySection {
  title: string;
  data: ScanRecord[];
}

/**
 * Splits the history into one section per calendar day, newest first.
 *
 * Days are local midnights, not `at / 86400000`: that would cut the day at UTC
 * midnight, which lands mid-evening in Vietnam and would file an evening scan
 * under tomorrow.
 *
 * `records` is already newest-first, so one pass suffices - no sort. `now` is a
 * parameter for the same reason it is on the rest of this module: the result
 * stays a pure function of its inputs and testable without freezing the clock.
 */
export function groupByDay(
  records: readonly ScanRecord[],
  now: number,
): DaySection[] {
  const today = dayKey(now);
  // Not `today - 86400000`: a day is not always 24 hours once a timezone has a
  // DST shift, and yesterday's header would silently fall back to a date.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sections: DaySection[] = [];
  let key: number | null = null;

  for (const r of records) {
    const day = dayKey(r.at);
    if (day !== key) {
      key = day;
      const d = new Date(day);
      sections.push({
        title:
          day === today
            ? t('today')
            : day === yesterday.getTime()
            ? t('yesterday')
            : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
        data: [],
      });
    }
    sections[sections.length - 1].data.push(r);
  }

  return sections;
}

/**
 * Reads one stored record, tolerating the pre-face-detector shape.
 *
 * Records written by the COCO build carry `people`/`total`/`counts` and no
 * `faces`. Rather than bumping the storage key and throwing that history away,
 * `total` is read as the face count - it was the number of boxes on screen,
 * which is exactly what `faces` means now. The counts are wrong in the sense
 * that they counted chairs and boats too, but the alternative is showing the
 * user nothing at all for scans they remember taking.
 */
function toRecord(v: unknown): ScanRecord | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;

  if (
    typeof r.id !== 'string' ||
    typeof r.at !== 'number' ||
    typeof r.thumbnail !== 'string'
  ) {
    return null;
  }

  const faces =
    typeof r.faces === 'number'
      ? r.faces
      : typeof r.total === 'number'
        ? r.total
        : null;
  if (faces === null) return null;

  return { id: r.id, at: r.at, thumbnail: r.thumbnail, faces };
}

/**
 * Reads whatever storage returned, tolerating anything.
 *
 * Storage outlives the code that wrote it: a half-written value, a record shape
 * from an older build, or plain corruption must degrade to "no history" rather
 * than throw on the first render after an update.
 */
export function parseHistory(raw: string | null | undefined): ScanRecord[] {
  if (raw == null || raw === '') return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toRecord)
      .filter((r): r is ScanRecord => r !== null)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}
