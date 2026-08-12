import type { NormalizedBox } from './boxLayout';

export interface Detection extends NormalizedBox {
  score: number;
  classId: number;
}

/** Một ngưỡng cho mọi class - xem lý do ở `SCORE_THRESHOLD`. */
export function passesThreshold(d: Detection, threshold: number): boolean {
  return d.score >= threshold;
}

function area(b: NormalizedBox): number {
  return Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
}

/** Tỉ lệ chồng lấn giữa hai box, 0 = rời hẳn, 1 = trùng khít. */
export function iou(a: NormalizedBox, b: NormalizedBox): number {
  const w = Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin);
  const h = Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin);
  if (w <= 0 || h <= 0) return 0;

  const inter = w * h;
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

/**
 * Gộp kết quả nhiều lượt quét trên cùng một khung hình (NMS tham lam): xét từ
 * điểm cao xuống, bỏ box chồng quá nhiều lên một box CÙNG CLASS đã giữ.
 *
 * Mọi box phải đã ở hệ frame, vì hai lượt nhìn hai ô vuông khác nhau. Chỉ so
 * trong cùng class: người bế con mèo là hai vật thể chồng nhau hợp lệ.
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
