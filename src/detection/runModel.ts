import type { Frame } from 'react-native-vision-camera';
import type { Resizer } from 'react-native-vision-camera-resizer';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MAX_DETECTIONS, NUM_CLASSES, RAW_SCORE_FLOOR } from '../shared/constants';
import type { Detection } from '../shared/detections';

/**
 * Đọc output thô của YOLO26 thành danh sách detection. Toạ độ ở hệ ô vuông
 * model nhìn thấy, chưa quy về khung hình - xem `toFrameBox`.
 *
 * Model xuất với `end2end: false` nên output là `[1, 84, 8400]`:
 *   84 = 4 (cx, cy, w, h) + 80 điểm class
 *   8400 = 80² + 40² + 20² anchor của ba tầng stride
 * Xếp theo kênh, nên giá trị kênh `c` tại anchor `a` nằm ở `c * anchors + a`,
 * KHÔNG phải `a * 84 + c`. Đảo hai cái này thì box vẫn ra, chỉ sai chỗ.
 *
 * Toạ độ đã chuẩn hoá 0..1 sẵn (graph bọc trong `_NormalizeCoords`) và điểm
 * class đã qua sigmoid, nên hậu xử lý chỉ còn NMS - do `mergeDetections` lo.
 *
 * Bản export CÓ end2end thì output thành `[1, 300, 6]`, mỗi hàng hai góc + điểm
 * + class và đã NMS sẵn. Hai định dạng không liên quan gì nhau, mà nhầm thì
 * không có lỗi nào báo - kiểm bằng `tools/inspect_tflite.py` trước khi đổi.
 *
 * Đánh dấu 'worklet' vì đường camera gọi trong worklet, đường quét ảnh gọi
 * thẳng trên JS thread.
 */
export function parseDetections(outputs: readonly ArrayBuffer[]): Detection[] {
  'worklet';

  const out = new Float32Array(outputs[0]!);
  const anchors = out.length / (NUM_CLASSES + 4);

  const found: Detection[] = [];
  for (let a = 0; a < anchors; a++) {
    // Tìm class điểm cao nhất của anchor này.
    let best = -1;
    let bestScore = RAW_SCORE_FLOOR;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = out[(4 + c) * anchors + a]!;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) continue;

    // Box của YOLO là tâm + kích thước, không phải hai góc.
    const cx = out[a]!;
    const cy = out[anchors + a]!;
    const w = out[2 * anchors + a]!;
    const h = out[3 * anchors + a]!;

    found.push({
      xmin: cx - w / 2,
      ymin: cy - h / 2,
      xmax: cx + w / 2,
      ymax: cy + h / 2,
      score: bestScore,
      classId: best,
    });
  }

  // Không có NMS trong graph nên số box thô có thể rất lớn, mà NMS là O(n²).
  // Cắt bớt theo điểm trước khi đưa sang gộp.
  found.sort((x, y) => y.score - x.score);
  return found.length > MAX_DETECTIONS ? found.slice(0, MAX_DETECTIONS) : found;
}

/** Chạy model một lượt trên frame của camera (gọi trong worklet). */
export function readFrameDetections(
  model: TensorflowModel,
  resizer: Resizer,
  frame: Frame,
): Detection[] {
  'worklet';

  const resized = resizer.resize(frame);
  const buffer = resized.getPixelBuffer();

  let outputs: ArrayBuffer[];
  try {
    outputs = model.runSync([buffer]);
  } catch (e) {
    // "Failed to run TFLite Model" một mình không nói được gì. Kèm luôn ba số
    // liệu quyết định: cỡ buffer đưa vào, cỡ model đòi, và delegate đang bật.
    throw new Error(
      `${String(e)} | buffer ${buffer.byteLength}B` +
        ` | inputs ${JSON.stringify(model.inputs)}` +
        ` | delegates ${JSON.stringify(model.delegates)}`,
    );
  } finally {
    // Phải dispose kể cả khi hỏng: resizer từ chối chạy tiếp nếu GPUFrame
    // trước đó còn treo.
    resized.dispose();
  }

  return parseDetections(outputs);
}
