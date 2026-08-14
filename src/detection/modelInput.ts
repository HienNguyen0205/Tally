import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import type { ScreenRect } from '../shared/boxLayout';

/**
 * Vẽ một vùng ảnh vào ô vuông của model rồi đọc pixel ra float32 0..1, xếp
 * **planar/NCHW**: trọn mặt phẳng R, rồi G, rồi B - không xen kẽ từng pixel.
 *
 * Dùng chung cho cả hai model - phát hiện lẫn phân loại - vì cả hai cùng xuất
 * bằng litert-torch nên cùng nhận NCHW. Chỉ khác nhau ở `src`/`dst`: quét thì
 * lấy cả ảnh, phân loại thì lấy đúng vùng box.
 *
 * `dst` tính bằng {@link modelDestRect}: nằm gọn trong ô vuông thì phần thừa là
 * viền đen, tràn ra ngoài thì bị cắt - đúng hai chế độ của resizer.
 */
export function renderToInput(
  image: SkImage,
  src: ScreenRect,
  dst: ScreenRect,
  size: number,
): Float32Array | null {
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (surface == null) return null;

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('black'));
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(src.left, src.top, src.width, src.height),
    Skia.XYWHRect(dst.left, dst.top, dst.width, dst.height),
    Skia.Paint(),
  );
  surface.flush();

  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: size,
    height: size,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (pixels == null) return null;

  // Skia chỉ đọc ra được RGBA 4 kênh xen kẽ: bỏ alpha, chia 255 về 0..1, và
  // tách thành ba mặt phẳng liền nhau.
  const rgba = pixels as Uint8Array;
  const plane = size * size;
  const chw = new Float32Array(plane * 3);
  for (let p = 0, j = 0; p < plane; p++, j += 4) {
    chw[p] = rgba[j]! / 255;
    chw[plane + p] = rgba[j + 1]! / 255;
    chw[2 * plane + p] = rgba[j + 2]! / 255;
  }
  return chw;
}
