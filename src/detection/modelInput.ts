import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import type { ScreenRect } from '../shared/boxLayout';

/**
 * How a model wants its pixels laid out in the input buffer.
 *
 * `nchw` is planar - the whole R plane, then G, then B. `nhwc` is interleaved -
 * R,G,B for pixel 0, then pixel 1, and so on.
 *
 * This is not a detail that can be guessed: feeding a model the wrong layout
 * still runs, still returns numbers, and raises no error - the numbers are just
 * meaningless. Both layouts are in use here because the models come from
 * different export paths (see assets/models/README.md).
 */
export type PixelLayout = 'nchw' | 'nhwc';

/**
 * The value range a model's first layer expects, applied as `v * scale + bias`
 * to a 0..1 pixel.
 *
 * `UNIT` (0..1) is what the YOLO26 detector takes, and what FaceMesh's own
 * metadata.json declares outright (`value_range: [0.0, 1.0]`).
 *
 * `SIGNED` (-1..1) is the InsightFace convention for ArcFace, `(p*255 - 127.5)
 * / 127.5`. Unlike the other two this could NOT be read off the graph -
 * arcface.tflite feeds its input straight into a convolution with no
 * normalisation layer at all, so the range is whatever it was trained with and
 * the caller has to supply it. If recognition ever behaves like it is matching
 * noise, this constant is the first thing to doubt: see the check described in
 * assets/models/README.md.
 */
export const UNIT_RANGE = { scale: 1, bias: 0 } as const;
export const SIGNED_RANGE = { scale: 2, bias: -1 } as const;

export interface InputFormat {
  layout: PixelLayout;
  range: { scale: number; bias: number };
  /**
   * Turn the source this many radians about the destination square's centre
   * before reading it, to level a tilted face.
   *
   * ArcFace was trained on crops whose eyes sit on a horizontal line, so a head
   * tilted 20 degrees produces an embedding measurably further from its own
   * enrolled one. FaceMesh hands us the roll angle for free, and undoing it
   * costs one canvas call.
   */
  spin?: number;
}

/**
 * Draws a region of an image into a square and hands back the result.
 *
 * Shared by both readers below - the pixel one for models running here, the
 * JPEG one for the model running on a server. Two copies of the rotate-and-
 * cover maths would be two places for it to drift.
 */
function drawCrop(
  image: SkImage,
  src: ScreenRect,
  dst: ScreenRect,
  size: number,
  spin: number,
): SkImage | null {
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (surface == null) return null;

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('black'));

  let target = dst;
  if (spin !== 0) {
    // Degrees, about the middle of the square - Skia's rotate takes the pivot
    // as arguments rather than needing a translate/rotate/translate sandwich.
    canvas.rotate((-spin * 180) / Math.PI, size / 2, size / 2);

    // ...and then the destination has to grow, or the correction pays for
    // itself with damage. Turning a square inside its own bounds leaves four
    // black wedges at the corners, and a black wedge over a cheek is not a
    // tilted face made straight, it is a face with a bite taken out of it -
    // which is worse for a recogniser than the tilt was.
    //
    // |cos| + |sin| is exactly the factor at which the turned rectangle covers
    // the upright one again. The cost is a slightly tighter crop, which the
    // FACE_CROP_MARGIN padding is there to absorb.
    const cover = Math.abs(Math.cos(spin)) + Math.abs(Math.sin(spin));
    const grownW = dst.width * cover;
    const grownH = dst.height * cover;
    target = {
      left: dst.left - (grownW - dst.width) / 2,
      top: dst.top - (grownH - dst.height) / 2,
      width: grownW,
      height: grownH,
    };
  }

  canvas.drawImageRect(
    image,
    Skia.XYWHRect(src.left, src.top, src.width, src.height),
    Skia.XYWHRect(target.left, target.top, target.width, target.height),
    Skia.Paint(),
  );
  surface.flush();
  return surface.makeImageSnapshot();
}

/**
 * Draws a region of an image into the model's square and reads the pixels back
 * as float32 in the layout and range that model wants.
 *
 * `dst` comes from {@link modelDestRect}: sitting inside the square leaves
 * black bars, spilling past it crops - exactly the resizer's two modes.
 */
export function renderToInput(
  image: SkImage,
  src: ScreenRect,
  dst: ScreenRect,
  size: number,
  format: InputFormat,
): Float32Array | null {
  const snapshot = drawCrop(image, src, dst, size, format.spin ?? 0);
  if (snapshot == null) return null;

  const pixels = snapshot.readPixels(0, 0, {
    width: size,
    height: size,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (pixels == null) return null;

  // Skia can only read back interleaved 4-channel RGBA, so both layouts start
  // from the same buffer: drop alpha, scale into the model's range, and either
  // split into planes or keep the interleaving.
  const rgba = pixels as Uint8Array;
  const { scale, bias } = format.range;
  const plane = size * size;
  const out = new Float32Array(plane * 3);
  const norm = scale / 255;

  if (format.layout === 'nchw') {
    for (let p = 0, j = 0; p < plane; p++, j += 4) {
      out[p] = rgba[j]! * norm + bias;
      out[plane + p] = rgba[j + 1]! * norm + bias;
      out[2 * plane + p] = rgba[j + 2]! * norm + bias;
    }
  } else {
    for (let p = 0, j = 0, k = 0; p < plane; p++, j += 4, k += 3) {
      out[k] = rgba[j]! * norm + bias;
      out[k + 1] = rgba[j + 1]! * norm + bias;
      out[k + 2] = rgba[j + 2]! * norm + bias;
    }
  }
  return out;
}

/**
 * The same crop, encoded as base64 JPEG for the embedding server.
 *
 * No `spin` here on purpose. The server aligns the face itself, with a proper
 * affine fit onto ArcFace's five-point template - a rotation this end would
 * either be undone there or, worse, applied twice, because the landmarks sent
 * alongside describe the UNROTATED crop. Levelling the eyes was a stand-in for
 * that alignment while ArcFace ran on the phone; it is not needed once the
 * real thing is available.
 *
 * Quality 95: the wire cost is a few kilobytes either way, while JPEG
 * artefacts land on exactly the fine texture a face recogniser reads.
 *
 * Base64 rather than bytes because the server takes a JSON body now. Skia
 * encodes straight to it, so there is no byte array to convert and no base64
 * library in the path - the 33% the encoding adds is the price of the format,
 * and a 224px face crop is a few tens of KB either way.
 */
export function renderToBase64(
  image: SkImage,
  src: ScreenRect,
  size: number,
): string | null {
  const snapshot = drawCrop(
    image,
    src,
    { left: 0, top: 0, width: size, height: size },
    size,
    0,
  );
  return snapshot?.encodeToBase64(ImageFormat.JPEG, 95) ?? null;
}
