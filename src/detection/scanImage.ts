import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MODEL_SIZE, NMS_IOU } from '../shared/constants';
import { modelDestRect, toFrameBox, type ScanSpace } from '../shared/boxLayout';
import { renderToInput, UNIT_RANGE } from './modelInput';
import { mergeDetections, type Detection } from '../shared/detections';
import { parseDetections } from './runModel';

/**
 * Scans an existing image, returning detections in the image's own space (0..1).
 *
 * Runs the same two passes and the same merge as the camera path - the resizer
 * only accepts a Frame, so the input has to be built with Skia here.
 *
 * Uses async `run` rather than `runSync`: this is the JS thread, and two 640
 * inferences take long enough to block React from even painting the photo the
 * user just picked.
 */
export async function scanImage(
  model: TensorflowModel,
  image: SkImage,
): Promise<Detection[] | null> {
  const w = image.width();
  const h = image.height();
  const whole = { left: 0, top: 0, width: w, height: h };

  const passes: Detection[][] = [];
  for (const space of ['contain', 'cover'] as const satisfies ScanSpace[]) {
    const input = renderToInput(
      image,
      whole,
      modelDestRect(w, h, space, MODEL_SIZE),
      MODEL_SIZE,
      // NCHW: this detector's input is [1, 3, 640, 640]. The recognition
      // models next door are NHWC - different export paths, see
      // assets/models/README.md.
      { layout: 'nchw', range: UNIT_RANGE },
    );
    if (input == null) return null;

    const raw = parseDetections(await model.run([input.buffer as ArrayBuffer]));
    passes.push(raw.map(d => ({ ...d, ...toFrameBox(d, space, w, h) })));
  }

  return mergeDetections(passes, NMS_IOU);
}
