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

/**
 * A larger JPEG of the same image, base64 encoded, for opening a past scan.
 *
 * Aspect preserved and uncropped, unlike the row thumbnail: the point of
 * reopening a scan is seeing what was in the frame, and a centre crop has
 * already thrown away the sides.
 *
 * 1024px on the long edge, not 512: the viewer draws this at up to the full
 * screen width, which on a typical ~400dp-wide phone is close to 1000
 * physical pixels once padding is subtracted. 512 was stretched roughly 2x to
 * fill that, which is what read as "vỡ nét" - blocky JPEG compression made
 * worse by the upscale. 1024 covers it without upscaling on most phones.
 * (An earlier version of this comment also worried about a "6MB AsyncStorage
 * default" - that number belonged to React Native's old built-in AsyncStorage,
 * not the MMKV-backed store this app depends on now (see shared/storage.ts),
 * which has no such fixed quota. Storage still is not free, so the cap stays
 * a deliberate number rather than the source resolution.)
 *
 * Stored under its own key rather than inside the history list, so loading the
 * list stays cheap and a preview is only read when a row is actually opened.
 */
export function makePreview(image: SkImage, maxSide = 1024): string | null {
  const w = image.width();
  const h = image.height();
  // Never upscale: a frame already smaller than the cap is stored as it is.
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const surface = Skia.Surface.MakeOffscreen(outW, outH);
  if (surface == null) return null;

  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(0, 0, w, h),
      Skia.XYWHRect(0, 0, outW, outH),
      Skia.Paint(),
    );
  surface.flush();

  return surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 76);
}
