import { useCallback, useMemo, useState } from 'react';

import { passesThreshold, type Detection } from '../shared/detections';

/**
 * Splits a scan result into what the chip row counts and what actually gets
 * drawn. Hiding a class must not remove its chip, so the counts come from the
 * score-filtered set rather than the visible one.
 */
export function useClassFilter(
  result: Detection[] | null,
  threshold: number,
) {
  // Classes switched off on the chip row. Empty = show everything.
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  const scored = useMemo(
    () => result?.filter(d => passesThreshold(d, threshold)) ?? [],
    [result, threshold],
  );

  const visible = useMemo(
    () => scored.filter(d => !hidden.has(d.classId)),
    [scored, hidden],
  );

  const counts = useMemo(() => {
    const byClass = new Map<number, number>();
    for (const d of scored) {
      byClass.set(d.classId, (byClass.get(d.classId) ?? 0) + 1);
    }
    return [...byClass]
      .map(([classId, count]) => ({ classId, count }))
      .sort((a, b) => b.count - a.count);
  }, [scored]);

  const toggle = useCallback((classId: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }, []);

  const reset = useCallback(() => setHidden(new Set()), []);

  return { hidden, scored, visible, counts, toggle, reset };
}
