import type { NormalizedBox } from './boxLayout';

export interface Detection extends NormalizedBox {
  score: number;
  classId: number;
}

/**
 * Một ngưỡng cho mọi class, không ưu ái class nào.
 *
 * Từng thử hạ riêng ngưỡng cho các class không phải 'person' rồi bỏ: thanh
 * trượt ghi 90% mà vật thể 73% vẫn hiện thì con số hiển thị thành nói dối.
 */
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
 * Gộp kết quả của nhiều lượt quét trên cùng một khung hình (NMS tham lam).
 *
 * Mọi box phải đã ở hệ frame - hai lượt nhìn hai ô vuông khác nhau nên so trực
 * tiếp toạ độ thô sẽ ra kết quả vô nghĩa.
 *
 * Xét từ điểm cao xuống thấp và bỏ box nào chồng quá nhiều lên một box CÙNG
 * CLASS đã giữ. Chỉ so trong cùng class: người bế con mèo là hai vật thể chồng
 * nhau hoàn toàn hợp lệ.
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
