import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';

/**
 * A small square JPEG of an image, base64 encoded, for a history row.
 *
 * Centre-cropped rather than squashed so every row is the same shape and
 * nothing looks stretched. At 96px and quality 60 a frame comes out around 4KB,
 * which is what makes storing fifty of them in key-value storage reasonable.
 *
 * Returns null when the offscreen surface cannot be created - the caller stores
 * the scan without a thumbnail rather than losing the record.
 */
export function makeThumbnail(image: SkImage, size = 96): string | null {
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (surface == null) return null;

  const w = image.width();
  const h = image.height();
  const side = Math.min(w, h);

  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect((w - side) / 2, (h - side) / 2, side, side),
      Skia.XYWHRect(0, 0, size, size),
      Skia.Paint(),
    );
  surface.flush();

  return surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 60);
}
