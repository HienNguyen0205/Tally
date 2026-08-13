import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MODEL_SIZE, NMS_IOU } from './constants';
import { modelDestRect, toFrameBox, type ScanSpace } from './boxLayout';
import { mergeDetections, type Detection } from './detections';
import { parseDetections } from './runModel';

/**
 * Ép ảnh vào ô vuông của model rồi đọc pixel ra - bản làm bằng Skia của việc
 * resizer làm cho frame camera, vì resizer chỉ nhận Frame.
 *
 * Phải khớp đúng định dạng RESIZER_FORMAT: float32 0..1, xếp planar (NCHW).
 */
function toModelInput(image: SkImage, space: ScanSpace): Float32Array | null {
  const w = image.width();
  const h = image.height();

  const surface = Skia.Surface.MakeOffscreen(MODEL_SIZE, MODEL_SIZE);
  if (surface == null) return null;

  const canvas = surface.getCanvas();
  // Nền đen: phần ô vuông mà ảnh không phủ tới chính là viền letterbox.
  canvas.clear(Skia.Color('black'));

  const dst = modelDestRect(w, h, space, MODEL_SIZE);
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, w, h),
    Skia.XYWHRect(dst.left, dst.top, dst.width, dst.height),
    Skia.Paint(),
  );
  surface.flush();

  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: MODEL_SIZE,
    height: MODEL_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (pixels == null) return null;

  // Skia chỉ đọc ra được RGBA 4 kênh: bỏ alpha, chia 255 về 0..1, và tách
  // thành ba mặt phẳng R/G/B liền nhau thay vì xen kẽ từng pixel.
  const rgba = pixels as Uint8Array;
  const plane = MODEL_SIZE * MODEL_SIZE;
  const chw = new Float32Array(plane * 3);
  for (let p = 0, j = 0; p < plane; p++, j += 4) {
    chw[p] = rgba[j]! / 255;
    chw[plane + p] = rgba[j + 1]! / 255;
    chw[2 * plane + p] = rgba[j + 2]! / 255;
  }
  return chw;
}

/**
 * Quét một ảnh có sẵn, trả về detection ở hệ toạ độ của ảnh (0..1).
 *
 * Chạy đúng hai lượt rồi gộp như đường camera. Nằm trên JS thread vì đây là
 * thao tác một lần do người dùng bấm, không phải đường frame chạy liên tục.
 */
export function scanImage(
  model: TensorflowModel,
  image: SkImage,
): Detection[] | null {
  const w = image.width();
  const h = image.height();

  const passes: Detection[][] = [];
  for (const space of ['contain', 'cover'] as const) {
    const input = toModelInput(image, space);
    if (input == null) return null;

    const raw = parseDetections(model.runSync([input.buffer as ArrayBuffer]));
    passes.push(raw.map(d => ({ ...d, ...toFrameBox(d, space, w, h) })));
  }

  return mergeDetections(passes, NMS_IOU);
}
