import type { NormalizedBox } from './boxLayout';

export interface Detection extends NormalizedBox {
  score: number;
  classId: number;
}

/** One threshold for every class - see `SCORE_THRESHOLD` for why. */
export function passesThreshold(d: Detection, threshold: number): boolean {
  return d.score >= threshold;
}

function area(b: NormalizedBox): number {
  return Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
}

/** Overlap ratio between two boxes: 0 = disjoint, 1 = identical. */
export function iou(a: NormalizedBox, b: NormalizedBox): number {
  const w = Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin);
  const h = Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin);
  if (w <= 0 || h <= 0) return 0;

  const inter = w * h;
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Merges several passes over the same frame (greedy NMS): walk from the highest
 * score down, dropping any box that overlaps too much with an already-kept box
 * of the SAME CLASS.
 *
 * Every box must already be in frame space, because the two passes looked at two
 * different squares. Comparison stays within a class: someone holding a cat is
 * two legitimately overlapping objects.
 */
export function mergeDetections(
  passes: Detection[][],
  iouLimit: number,
): Detection[] {
  const all = passes.flat().sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];

  for (const d of all) {
    const duplicate = kept.some(
      k => k.classId === d.classId && iou(k, d) > iouLimit,
    );
    if (!duplicate) kept.push(d);
  }

  return kept;
}
