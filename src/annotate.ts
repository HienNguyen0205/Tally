import { Platform } from 'react-native';
import {
  FontWeight,
  PaintStyle,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';

import { boxToScreen } from './boxLayout';
import { PERSON_CLASS_ID } from './constants';
import type { Detection } from './detections';
import { COCO_LABELS } from './labels';

const PERSON_COLOR = '#00E676'; // người - xanh
const OBJECT_COLOR = '#FFC400'; // vật thể khác - vàng

function makePaint(color: string, style: PaintStyle, strokeWidth = 0) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(style);
  if (strokeWidth > 0) paint.setStrokeWidth(strokeWidth);
  return paint;
}

const personPaint = makePaint(PERSON_COLOR, PaintStyle.Stroke, 4);
const objectPaint = makePaint(OBJECT_COLOR, PaintStyle.Stroke, 4);
// Nền nhãn tô đặc cùng màu box, chữ đen lên trên cho dễ đọc.
const personFill = makePaint(PERSON_COLOR, PaintStyle.Fill);
const objectFill = makePaint(OBJECT_COLOR, PaintStyle.Fill);
const textPaint = makePaint('#000000', PaintStyle.Fill);

// Phải đặt đúng tên family có thật trên máy. 'System'/'Roboto'/chuỗi rỗng đều
// trả về Typeface trông hợp lệ nhưng KHÔNG có glyph (đo chữ ra width = 0, vẽ ra
// vô hình). Chỉ 'sans-serif' hoạt động - đây là tên family Android thật sự có.
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
 * Vẽ box + nhãn lên ảnh đã chụp, trả về ảnh mới để đem đi lưu. Trên màn hình
 * box là View của RN nằm đè lên ảnh, tới lúc lưu mới nung vào pixel.
 *
 * Không tạo được surface thì trả lại ảnh trần: lưu ảnh không box vẫn hơn là
 * báo lỗi và mất luôn tấm ảnh.
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

  // Cỡ chữ theo độ phân giải ảnh, không phải pixel màn hình - nếu không nhãn
  // sẽ bé tí trên ảnh lớn.
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

    const name = COCO_LABELS[d.classId] ?? `#${d.classId}`;
    const text = `${name} ${Math.round(d.score * 100)}%`;
    const textW = labelFont.measureText(text).width;

    // Nhãn nằm trên box; nếu box sát mép trên thì lật xuống trong box.
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
