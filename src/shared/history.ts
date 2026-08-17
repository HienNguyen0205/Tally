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
 * around 200KB - comfortably inside AsyncStorage's per-app budget, which is
 * capped at 6MB by default on Android.
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago a scan happened, in Vietnamese.
 *
 * `now` is a parameter rather than a `Date.now()` call so the result is a pure
 * function of its inputs and can be tested without freezing the clock.
 */
export function relativeTime(at: number, now: number): string {
  const ago = Math.max(0, now - at);

  if (ago < MINUTE) return t.justNow;
  if (ago < HOUR) return t.minutesAgo(Math.floor(ago / MINUTE));
  if (ago < DAY) return t.hoursAgo(Math.floor(ago / HOUR));
  return t.daysAgo(Math.floor(ago / DAY));
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
