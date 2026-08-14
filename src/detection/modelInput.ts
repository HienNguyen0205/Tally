import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import type { ScreenRect } from '../shared/boxLayout';

/**
 * Draws a region of an image into the model's square, then reads the pixels out
 * as float32 0..1 laid out **planar/NCHW**: the whole R plane, then G, then B -
 * not interleaved per pixel.
 *
 * Shared by both models - detector and classifier - because both were exported
 * through litert-torch and so both take NCHW. Only `src`/`dst` differ: a scan
 * takes the whole image, a classification takes just the box region.
 *
 * `dst` comes from {@link modelDestRect}: sitting inside the square leaves black
 * bars, spilling past it crops - exactly the resizer's two modes.
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

  // Skia can only read back interleaved 4-channel RGBA: drop alpha, divide by
  // 255 into 0..1, and split into three contiguous planes.
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
