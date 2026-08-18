import type { Detection } from './detections';
import { PERSON_CLASS_ID } from './constants';
import { t } from './strings';

export interface ClassCount {
  classId: number;
  count: number;
}

export interface ScanRecord {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  /** Base64 JPEG, no data: prefix. Small enough to sit in key-value storage. */
  thumbnail: string;
  people: number;
  total: number;
  counts: ClassCount[];
}

/**
 * How many scans to keep. Each record carries a ~4KB thumbnail, so 50 lands
 * around 200KB - well inside reason for a JSON blob parsed on every launch,
 * regardless of the previews that live outside this list (see previewKey in
 * useScanHistory.ts).
 */
export const HISTORY_LIMIT = 50;

/** Collapses the boxes on screen into the numbers a history row shows. */
export function summarise(visible: Detection[]): {
  people: number;
  total: number;
  counts: ClassCount[];
} {
  const byClass = new Map<number, number>();
  for (const d of visible) {
    byClass.set(d.classId, (byClass.get(d.classId) ?? 0) + 1);
  }

  return {
    people: visible.filter(d => d.classId === PERSON_CLASS_ID).length,
    total: visible.length,
    counts: [...byClass]
      .map(([classId, count]) => ({ classId, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Adds up several scans - the point of scanning a batch is the combined figure,
 * which no single record holds.
 */
export function totalOf(records: readonly ScanRecord[]): {
  people: number;
  total: number;
  photos: number;
} {
  return {
    people: records.reduce((n, r) => n + r.people, 0),
    total: records.reduce((n, r) => n + r.total, 0),
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
            ? t.today
            : day === yesterday.getTime()
            ? t.yesterday
            : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
        data: [],
      });
    }
    sections[sections.length - 1].data.push(r);
  }

  return sections;
}

function isRecord(v: unknown): v is ScanRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.at === 'number' &&
    typeof r.thumbnail === 'string' &&
    typeof r.people === 'number' &&
    typeof r.total === 'number' &&
    Array.isArray(r.counts)
  );
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
    return parsed.filter(isRecord).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}
