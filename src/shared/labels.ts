import { t } from '../i18n';
import { FACE_CLASS_ID } from './constants';

/**
 * The detector's class names. One entry, because MediaPipe's face detector is a
 * single-class model (WIDER FACE): its output tensor carries 4 box
 * coordinates plus one score, not 80.
 *
 * This replaced the 80-name COCO table. Everything that used to branch on
 * which class a box was - two box colours, the class filter, the ImageNet
 * refine step - went with it, since there is nothing left to tell apart.
 */
export function label(classId: number): string {
  // Anything but the one class means the label table and the model have
  // drifted apart. Showing the raw index makes that obvious rather than
  // silently calling some other class a face.
  return labelForCount(classId, 1);
}

/**
 * The class name inflected for `count`.
 *
 * Vietnamese does not inflect nouns for number ("3 khuôn mặt" and "1 khuôn
 * mặt" use the same word), so only English branches. i18n-js does the choosing
 * from the `{ one, other }` forms in the catalog - see `PLURAL_KEYS` in
 * i18n/vi.ts - rather than a suffix rule, which is what the 80-class version
 * needed and what made it worth 40 lines.
 */
export function labelForCount(classId: number, count: number): string {
  return classId === FACE_CLASS_ID ? t('faceName', { count }) : `#${classId}`;
}
