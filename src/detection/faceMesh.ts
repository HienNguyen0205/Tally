import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { MESH_SIZE } from '../shared/constants';
import type { ScreenRect } from '../shared/boxLayout';
import {
  landmarksToReading,
  MESH_POINTS,
  type MeshReading,
} from './meshLandmarks';
import { renderToInput, UNIT_RANGE } from './modelInput';

/** Below this the crop is not a face at all - the model says so itself. */
const MIN_PRESENCE = 0.5;

/**
 * Runs FaceMesh over one face crop.
 *
 * Replaces facemap_3dmm, which did this job with 21.7MB and could only ever
 * answer with angles: that model emits 3DMM coefficients, and turning them
 * into geometry needs three basis matrices that ship separately and were never
 * in this repo. This one emits the geometry directly.
 *
 * **Landmark units.** The graph ends in a RESHAPE with no normalisation after
 * it, so landmarks come back in pixels of the 192 square, MediaPipe's
 * convention. The guard below divides by MESH_SIZE only when the numbers
 * actually look like pixels - an export that normalises them itself would
 * otherwise be quietly divided into a dot in the top-left corner, and one
 * comparison is cheaper than finding that out on a device.
 *
 * **The angles are estimates, not measurements.** FaceMesh's z is roughly in
 * the same units as x, so the depth difference across a pair of landmarks
 * gives an angle through atan2 - accurate enough to answer "is this face
 * turned too far to recognise", which is all the gate asks. It is not a
 * calibrated head pose, and nothing should treat it as one.
 */
export async function readMesh(
  model: TensorflowModel,
  image: SkImage,
  crop: ScreenRect,
): Promise<MeshReading | null> {
  const input = renderToInput(
    image,
    crop,
    { left: 0, top: 0, width: MESH_SIZE, height: MESH_SIZE },
    MESH_SIZE,
    { layout: 'nhwc', range: UNIT_RANGE },
  );
  if (input == null) return null;

  const outputs = await model.run([input.buffer as ArrayBuffer]);

  // By length, not by position: [1] and [1,468,3] are unmistakable, while
  // trusting the output order would break silently if an export reordered it.
  let raw: Float32Array | null = null;
  let presence = 0;
  for (const out of outputs) {
    const floats = out.byteLength / 4;
    if (floats === MESH_POINTS * 3) raw = new Float32Array(out);
    else if (floats === 1) presence = new Float32Array(out)[0]!;
  }
  if (raw == null) return null;
  if (presence < MIN_PRESENCE) {
    return { points: new Float32Array(0), presence, yaw: 0, pitch: 0, roll: 0 };
  }

  return landmarksToReading(raw, presence, crop, image.width(), image.height());
}
