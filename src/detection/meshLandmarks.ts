import { MESH_SIZE } from '../shared/constants';
import type { ScreenRect } from '../shared/boxLayout';

/** How many landmarks FaceMesh returns, from its output tensor [1, 468, 3]. */
export const MESH_POINTS = 468;

/**
 * The handful of landmarks the pose maths reads, by their index in MediaPipe's
 * canonical 468-point face.
 *
 * Left and right are the image's, not the subject's - which way round they are
 * only flips the sign of yaw and roll, and the gate takes magnitudes.
 */
const LM = {
  eyeOuterLeft: 263,
  eyeOuterRight: 33,
  foreheadTop: 10,
  chin: 152,
} as const;

/**
 * The landmarks ArcFace's alignment template is defined on, as indices into
 * the 468. Eyes are the midpoint of their two corners; the rest are single
 * points.
 */
const FIVE = {
  eyeA: [33, 133],
  eyeB: [362, 263],
  nose: [1],
  mouthA: [61],
  mouthB: [291],
} as const;

export interface MeshReading {
  /**
   * All 468 landmarks as x,y pairs in the SOURCE IMAGE's normalised space
   * (0..1), ready to draw over the frame with no further mapping.
   */
  points: Float32Array;
  /** The model's own confidence that this crop contains a face. */
  presence: number;
  /** Radians, and estimates rather than measurements - see landmarksToReading. */
  yaw: number;
  pitch: number;
  roll: number;
}

/**
 * The five landmarks ArcFace aligns on, in the crop's own pixels.
 *
 * `points` arrives in the image's 0..1 space (that is what the mask draws
 * with), while the server receives a JPEG of the crop alone and knows nothing
 * about the frame it came from - so the coordinates have to be rebased onto
 * that JPEG, which is what `crop` and `size` are for.
 *
 * Order is fixed by ArcFace's template: left eye, right eye, nose, left mouth
 * corner, right mouth corner - where LEFT MEANS SMALLER X IN THE IMAGE, not
 * the subject's own left.
 *
 * Which is why the two pairs are sorted by x rather than assigned by index.
 * MediaPipe's 33/133 are the subject's right eye, so in a normal photo they
 * sit at smaller x - but the front camera mirrors the picture and they move to
 * the other side, while the template stays put. A similarity transform cannot
 * mirror, so feeding it a swapped pair does not fail: it fits the best
 * non-mirrored compromise it can find, quietly, and the embedding drifts. The
 * landmark at smaller x belongs in slot 0 either way, so sorting is the rule
 * that is right in both.
 *
 * Holds up to roughly 45 degrees of roll; past that the eyes stack vertically
 * and x stops separating them. Nothing here is reliable at that angle anyway.
 */
export function fivePoints(
  points: Float32Array,
  crop: ScreenRect,
  imageW: number,
  imageH: number,
  size: number,
): [number, number][] {
  const mean = (indices: readonly number[]): [number, number] => {
    let x = 0;
    let y = 0;
    for (const i of indices) {
      x += points[i * 2]!;
      y += points[i * 2 + 1]!;
    }
    const n = indices.length;
    return [
      ((x / n) * imageW - crop.left) * (size / crop.width),
      ((y / n) * imageH - crop.top) * (size / crop.height),
    ];
  };

  const byX = (
    a: [number, number],
    b: [number, number],
  ): [[number, number], [number, number]] => (a[0] <= b[0] ? [a, b] : [b, a]);

  const [eyeLeft, eyeRight] = byX(mean(FIVE.eyeA), mean(FIVE.eyeB));
  const [mouthLeft, mouthRight] = byX(mean(FIVE.mouthA), mean(FIVE.mouthB));

  return [eyeLeft, eyeRight, mean(FIVE.nose), mouthLeft, mouthRight];
}

/**
 * Turns FaceMesh's raw output into points on the image and angles on the face.
 *
 * Split out from the model call so it can be tested: everything below is
 * arithmetic with a right answer, and it is the half where a wrong answer
 * looks plausible - a mask that sits slightly off the face, or a pose gate
 * that lets a profile through.
 */
export function landmarksToReading(
  raw: Float32Array,
  presence: number,
  crop: ScreenRect,
  imageW: number,
  imageH: number,
): MeshReading {
  // Pixels of the 192 square, or already normalised? The graph ends in a
  // RESHAPE with nothing after it, so this export gives pixels - but an export
  // that normalised them would otherwise be divided a second time into a dot
  // in the corner, and one comparison is cheaper than finding that out on a
  // device.
  let biggest = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Math.abs(raw[i]!);
    if (v > biggest) biggest = v;
  }
  const unit = biggest > 2 ? 1 / MESH_SIZE : 1;

  // Landmarks first, in the crop's own 0..1 square, then mapped onto the
  // image. The crop was drawn to fill the whole square, so both steps are a
  // straight linear scale.
  const points = new Float32Array(MESH_POINTS * 2);
  for (let i = 0; i < MESH_POINTS; i++) {
    const x = raw[i * 3]! * unit;
    const y = raw[i * 3 + 1]! * unit;
    points[i * 2] = (crop.left + x * crop.width) / imageW;
    points[i * 2 + 1] = (crop.top + y * crop.height) / imageH;
  }

  // Angles stay in the crop's square, where x, y and z share a scale and one
  // unit is one unit in every direction. Doing this in image space instead
  // would stretch every angle by the frame's aspect ratio.
  const at = (i: number) => ({
    x: raw[i * 3]! * unit,
    y: raw[i * 3 + 1]! * unit,
    z: raw[i * 3 + 2]! * unit,
  });
  const eyeL = at(LM.eyeOuterLeft);
  const eyeR = at(LM.eyeOuterRight);
  const top = at(LM.foreheadTop);
  const chin = at(LM.chin);

  return {
    points,
    presence,
    // Depth across the eye line: level in depth means facing the camera.
    yaw: Math.atan2(eyeL.z - eyeR.z, eyeL.x - eyeR.x),
    // Same idea down the face's long axis.
    pitch: Math.atan2(chin.z - top.z, chin.y - top.y),
    // The one real measurement here: how far off horizontal the eyes sit.
    roll: Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x),
  };
}
