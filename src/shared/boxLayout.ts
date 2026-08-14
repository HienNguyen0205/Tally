export interface NormalizedBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The square the resizer squeezed the frame into before handing it to the model.
 *
 * - `'contain'` (letterbox): side = the frame's LONG edge, the surplus is black
 *   bars. Keeps the whole frame.
 * - `'cover'`: side = the SHORT edge, trimming both ends of the long one. Loses
 *   the margins, but the middle gets the full square, so small objects come
 *   through far more clearly.
 */
export type ScanSpace = 'contain' | 'cover';

/**
 * Maps a box out of the model's square into the FRAME's normalised space (0..1).
 *
 * The two passes use two different squares, so they have to be brought into one
 * space right here - before merging, measuring area, or working out hit regions.
 * A negative offset (`'contain'`) is the black bar to subtract; a positive one
 * (`'cover'`) is the cropped-away frame to add back.
 */
export function toFrameBox(
  box: NormalizedBox,
  space: ScanSpace,
  frameW: number,
  frameH: number,
): NormalizedBox {
  const boxSize =
    space === 'contain'
      ? Math.max(frameW, frameH)
      : Math.min(frameW, frameH);
  const offX = (frameW - boxSize) / 2;
  const offY = (frameH - boxSize) / 2;

  return {
    xmin: (offX + box.xmin * boxSize) / frameW,
    ymin: (offY + box.ymin * boxSize) / frameH,
    xmax: (offX + box.xmax * boxSize) / frameW,
    ymax: (offY + box.ymax * boxSize) / frameH,
  };
}

/**
 * The rect an image must be drawn into, inside the model's `modelSize` square.
 *
 * Used by the library-photo path, which has to build its input with Skia
 * because the resizer only accepts a Frame. It is the inverse of
 * {@link toFrameBox} and must follow exactly the same square convention - drift
 * here means wrong boxes with no error raised, which is why it lives next door
 * and has a test pinning the two together.
 */
export function modelDestRect(
  imageW: number,
  imageH: number,
  space: ScanSpace,
  modelSize: number,
): ScreenRect {
  const boxSize =
    space === 'contain' ? Math.max(imageW, imageH) : Math.min(imageW, imageH);
  const scale = modelSize / boxSize;
  const width = imageW * scale;
  const height = imageH * scale;

  return {
    left: (modelSize - width) / 2,
    top: (modelSize - height) / 2,
    width,
    height,
  };
}

/**
 * Maps a box (already in frame space, see {@link toFrameBox}) onto the pixels of
 * a drawing surface - the screen or a snapshot.
 *
 * SkiaCamera's canvas draws with fit="cover": scale up by whichever edge falls
 * short, then trim the other. Hence max() and the crop compensation.
 */
export function boxToScreen(
  box: NormalizedBox,
  frameW: number,
  frameH: number,
  screenW: number,
  screenH: number,
): ScreenRect {
  const scale = Math.max(screenW / frameW, screenH / frameH);
  const cropX = (screenW - frameW * scale) / 2;
  const cropY = (screenH - frameH * scale) / 2;

  return {
    left: cropX + box.xmin * frameW * scale,
    top: cropY + box.ymin * frameH * scale,
    width: (box.xmax - box.xmin) * frameW * scale,
    height: (box.ymax - box.ymin) * frameH * scale,
  };
}
