import type { Frame } from 'react-native-vision-camera';
import type { Resizer } from 'react-native-vision-camera-resizer';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MAX_DETECTIONS, RAW_SCORE_FLOOR } from './constants';
import type { Detection } from './detections';

/**
 * Đọc output thô của model thành danh sách detection.
 *
 * Toạ độ trả về vẫn nằm trong hệ ô vuông model đã nhìn, chưa quy về khung hình
 * - xem `toFrameBox` trong `src/boxLayout.ts`.
 *
 * Chỉ áp một sàn cứng rất thấp. Ngưỡng thật do JS lọc lúc hiển thị, để kéo
 * thanh ngưỡng là đổi được ngay trên ảnh đã chụp mà không phải quét lại.
 *
 * Đánh dấu 'worklet' vì đường camera gọi hàm này trong worklet; đường quét ảnh
 * từ thư viện gọi thẳng trên JS thread, cả hai đều chạy được.
 */
export function parseDetections(outputs: readonly ArrayBuffer[]): Detection[] {
  'worklet';

  // Thứ tự output đã kiểm chứng bằng model.outputs của lite2:
  //   [0] [1,25,4] boxes | [1] [1,25] classes
  //   [2] [1,25] scores  | [3] [1] số lượng
  // Đổi model khác thì phải log lại model.outputs để xác nhận.
  const boxes = new Float32Array(outputs[0]!);
  const classes = new Float32Array(outputs[1]!);
  const scores = new Float32Array(outputs[2]!);
  const numDetections = new Float32Array(outputs[3]!);
  const detCount = Math.min(Number(numDetections[0]), MAX_DETECTIONS);

  const found: Detection[] = [];
  for (let i = 0; i < detCount; i++) {
    if (Number(scores[i]) < RAW_SCORE_FLOOR) continue;
    found.push({
      ymin: boxes[i * 4]!,
      xmin: boxes[i * 4 + 1]!,
      ymax: boxes[i * 4 + 2]!,
      xmax: boxes[i * 4 + 3]!,
      score: scores[i]!,
      classId: Number(classes[i]),
    });
  }
  return found;
}

/** Chạy model một lượt trên frame của camera (gọi trong worklet). */
export function readFrameDetections(
  model: TensorflowModel,
  resizer: Resizer,
  frame: Frame,
): Detection[] {
  'worklet';

  const resized = resizer.resize(frame);
  const outputs = model.runSync([resized.getPixelBuffer()]);
  resized.dispose();

  return parseDetections(outputs);
}
