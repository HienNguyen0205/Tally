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
 * Ép ảnh vào ô vuông của model rồi đọc pixel ra dạng RGB uint8.
 *
 * Đây là bản làm bằng Skia của việc mà resizer làm cho frame camera - ảnh trong
 * thư viện không phải Frame nên resizer không nhận.
 */
function toModelInput(image: SkImage, space: ScanSpace): Uint8Array | null {
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

  // Model ăn RGB 3 kênh, Skia chỉ đọc ra được 4 kênh - bỏ kênh alpha.
  const rgba = pixels as Uint8Array;
  const rgb = new Uint8Array(MODEL_SIZE * MODEL_SIZE * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgb[i] = rgba[j]!;
    rgb[i + 1] = rgba[j + 1]!;
    rgb[i + 2] = rgba[j + 2]!;
  }
  return rgb;
}

/**
 * Quét một ảnh có sẵn, trả về detection đã ở hệ toạ độ của ảnh (0..1).
 *
 * Chạy đúng hai lượt như đường camera rồi gộp bằng NMS, nên kết quả của ảnh
 * trong thư viện và của ảnh vừa chụp là so sánh được với nhau.
 *
 * Chạy trên JS thread - đây là thao tác một lần do người dùng bấm, không nằm
 * trên đường frame chạy liên tục.
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
