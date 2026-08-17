import { Platform } from 'react-native';
import {
  FontWeight,
  PaintStyle,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import { boxToScreen } from '../shared/boxLayout';
import { PERSON_CLASS_ID } from '../shared/constants';
import type { Detection } from '../shared/detections';
import { label } from '../shared/labels';

const PERSON_COLOR = '#00E676'; // people - green
const OBJECT_COLOR = '#FFC400'; // other objects - amber

function makePaint(color: string, style: PaintStyle, strokeWidth = 0) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(style);
  if (strokeWidth > 0) paint.setStrokeWidth(strokeWidth);
  return paint;
}

const personPaint = makePaint(PERSON_COLOR, PaintStyle.Stroke, 4);
const objectPaint = makePaint(OBJECT_COLOR, PaintStyle.Stroke, 4);
// Solid label backing in the box colour, black text on top for legibility.
const personFill = makePaint(PERSON_COLOR, PaintStyle.Fill);
const objectFill = makePaint(OBJECT_COLOR, PaintStyle.Fill);
const textPaint = makePaint('#000000', PaintStyle.Fill);

// This must name a family that actually exists on the device. 'System',
// 'Roboto' and the empty string all return a Typeface that looks valid but has
// NO glyphs (text measures width = 0 and draws invisible). Only 'sans-serif'
// works - that is a real Android family name.
const LABEL_FONT_FAMILY = Platform.select({
  android: 'sans-serif',
  default: 'Helvetica',
});
const labelFont = Skia.Font(
  Skia.FontMgr.System().matchFamilyStyle(LABEL_FONT_FAMILY, {
    weight: FontWeight.Bold,
  }),
  24,
);

/**
 * Draws boxes + labels onto the captured image and returns a new image to save.
 * On screen the boxes are RN Views laid over the photo; only at save time do
 * they get burned into pixels.
 *
 * If the surface cannot be created, hand back the bare image: saving a photo
 * without boxes beats erroring out and losing the photo entirely.
 */
export function annotate(
  photo: SkImage,
  detections: Detection[],
  frameW: number,
  frameH: number,
): SkImage {
  const w = photo.width();
  const h = photo.height();

  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (surface == null) return photo;

  const canvas = surface.getCanvas();
  canvas.drawImage(photo, 0, 0);

  // Size the text off the image resolution, not screen pixels - otherwise the
  // labels come out tiny on a large photo.
  const fontSize = Math.max(16, Math.round(Math.min(w, h) * 0.045));
  labelFont.setSize(fontSize);
  const padX = fontSize * 0.35;
  const chipH = fontSize * 1.5;

  for (const d of detections) {
    const isPerson = d.classId === PERSON_CLASS_ID;
    const r = boxToScreen(d, frameW, frameH, w, h);

    canvas.drawRect(
      Skia.XYWHRect(r.left, r.top, r.width, r.height),
      isPerson ? personPaint : objectPaint,
    );

    // The same localised name the HUD shows, so a saved image and the screen
    // cannot disagree about what was found. Only the casing differs - the chip
    // on screen is styled with textTransform, which Skia has no equivalent of
    // and which is not worth reimplementing here.
    const name = label(d.classId);
    const text = `${name} ${Math.round(d.score * 100)}%`;
    const textW = labelFont.measureText(text).width;

    // The label sits above the box; if the box hugs the top edge, flip it
    // inside instead.
    const chipY = r.top - chipH >= 0 ? r.top - chipH : r.top;
    canvas.drawRect(
      Skia.XYWHRect(r.left, chipY, textW + padX * 2, chipH),
      isPerson ? personFill : objectFill,
    );
    canvas.drawText(
      text,
      r.left + padX,
      chipY + chipH - fontSize * 0.4,
      textPaint,
      labelFont,
    );
  }

  surface.flush();
  return surface.makeImageSnapshot();
}
