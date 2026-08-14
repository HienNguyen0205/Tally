import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { CLASSIFY_SIZE, MIN_REFINED_SCORE } from '../shared/constants';
import { modelDestRect, type ScreenRect } from '../shared/boxLayout';
import { renderToInput } from './modelInput';
import { IMAGENET_LABELS } from './imagenetLabels';

export interface Refined {
  label: string;
  score: number;
}

/**
 * Names a detected object more precisely: COCO's 80 coarse classes make every
 * breed just "dog", while the classifier has ImageNet's 1000.
 *
 * `rect` is the box region in `image`'s OWN PIXELS - use `boxToScreen` with the
 * image dimensions to convert out of frame space.
 *
 * Uses async `run` rather than `runSync`: this is the JS thread, and a single
 * inference takes long enough to stall the UI.
 */
export async function classifyCrop(
  model: TensorflowModel,
  image: SkImage,
  rect: ScreenRect,
): Promise<Refined | null> {
  // Preserve the crop's aspect ratio (letterboxing the remainder) rather than
  // squashing it - a stretched object classifies badly.
  //
  // This block is SYNCHRONOUS (Skia reads pixels, then splits channels). At 224
  // it fits in a frame; back when the model ran at 640 it cost ~126ms and had
  // to be deferred outright.
  const input = renderToInput(
    image,
    rect,
    modelDestRect(rect.width, rect.height, 'contain', CLASSIFY_SIZE),
    CLASSIFY_SIZE,
  );
  if (input == null) return null;

  const outputs = await model.run([input.buffer as ArrayBuffer]);
  const scores = new Float32Array(outputs[0]!);

  let best = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[best]!) best = i;
  }

  const label = IMAGENET_LABELS[best];
  // The graph already applies softmax, so the score is a 0..1 probability.
  const score = scores[best]!;
  if (label == null || score < MIN_REFINED_SCORE) return null;
  return { label, score };
}
