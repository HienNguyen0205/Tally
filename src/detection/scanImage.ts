import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MODEL_SIZE, NMS_IOU } from '../shared/constants';
import { modelDestRect, toFrameBox, type ScanSpace } from '../shared/boxLayout';
import { renderToInput } from './modelInput';
import { mergeDetections, type Detection } from '../shared/detections';
import { parseDetections } from './runModel';

/**
 * Quét một ảnh có sẵn, trả về detection ở hệ toạ độ của ảnh (0..1).
 *
 * Chạy đúng hai lượt rồi gộp như đường camera - resizer chỉ nhận Frame nên ở
 * đây phải tự dựng input bằng Skia.
 *
 * Dùng `run` bất đồng bộ chứ không `runSync`: đây là JS thread, mà hai lượt
 * suy luận 640² đủ lâu để chặn cả việc React vẽ tấm ảnh vừa chọn ra màn hình.
 */
export async function scanImage(
  model: TensorflowModel,
  image: SkImage,
): Promise<Detection[] | null> {
  const w = image.width();
  const h = image.height();
  const whole = { left: 0, top: 0, width: w, height: h };

  const passes: Detection[][] = [];
  for (const space of ['contain', 'cover'] as const satisfies ScanSpace[]) {
    const input = renderToInput(
      image,
      whole,
      modelDestRect(w, h, space, MODEL_SIZE),
      MODEL_SIZE,
    );
    if (input == null) return null;

    const raw = parseDetections(await model.run([input.buffer as ArrayBuffer]));
    passes.push(raw.map(d => ({ ...d, ...toFrameBox(d, space, w, h) })));
  }

  return mergeDetections(passes, NMS_IOU);
}
