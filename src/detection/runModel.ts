import type { Frame } from 'react-native-vision-camera';
import type { Resizer } from 'react-native-vision-camera-resizer';
import type { TensorflowModel } from 'react-native-fast-tflite';

import {
  MAX_DETECTIONS,
  NUM_CLASSES,
  RAW_SCORE_FLOOR,
} from '../shared/constants';
import type { Detection } from '../shared/detections';

/**
 * Reads YOLO26's raw output into a detection list. Coordinates are in the square
 * the model saw, not yet mapped onto the frame - see `toFrameBox`.
 *
 * The model is exported with `end2end: false`, so the output is `[1, 5, N]`:
 *   5 = 4 (cx, cy, w, h) + 1 face score
 *   N = anchors across the three stride levels - 2100 for a 320 input
 *       (40² + 20² + 10²), 8400 for a 640 one. Derived from the buffer below
 *       rather than hardcoded, so a re-export at another size still parses.
 * It is channel-major, so channel `c` at anchor `a` sits at `c * anchors + a`,
 * NOT `a * 84 + c`. Swap the two and boxes still come out, just in wrong places.
 *
 * Coordinates arrive already normalised to 0..1 (the graph is wrapped in
 * `_NormalizeCoords`) and class scores are already sigmoided, so the only
 * post-processing left is NMS - handled by `mergeDetections`.
 *
 * An end2end export instead emits `[1, 300, 6]`, each row two corners + score +
 * class, already NMS'd. The two formats have nothing to do with each other, and
 * mixing them up raises no error - check with `tools/inspect_tflite.py` before
 * swapping models.
 *
 * Marked 'worklet' because the camera path calls it inside a worklet while the
 * image path calls it straight on the JS thread.
 */
export function parseDetections(outputs: readonly ArrayBuffer[]): Detection[] {
  'worklet';

  const out = new Float32Array(outputs[0]!);
  const anchors = out.length / (NUM_CLASSES + 4);

  const found: Detection[] = [];
  for (let a = 0; a < anchors; a++) {
    // Find this anchor's top-scoring class.
    let best = -1;
    let bestScore = RAW_SCORE_FLOOR;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const score = out[(4 + c) * anchors + a]!;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) continue;

    // YOLO boxes are centre + size, not two corners.
    const cx = out[a]!;
    const cy = out[anchors + a]!;
    const w = out[2 * anchors + a]!;
    const h = out[3 * anchors + a]!;

    found.push({
      xmin: cx - w / 2,
      ymin: cy - h / 2,
      xmax: cx + w / 2,
      ymax: cy + h / 2,
      score: bestScore,
      classId: best,
    });
  }

  // With no NMS in the graph the raw box count can be huge, and NMS is O(n²).
  // Trim by score before handing it on to be merged.
  found.sort((x, y) => y.score - x.score);
  return found.length > MAX_DETECTIONS ? found.slice(0, MAX_DETECTIONS) : found;
}

/** Runs one pass over a camera frame (called inside a worklet). */
export function readFrameDetections(
  model: TensorflowModel,
  resizer: Resizer,
  frame: Frame,
): Detection[] {
  'worklet';

  const resized = resizer.resize(frame);
  const buffer = resized.getPixelBuffer();

  let outputs: ArrayBuffer[];
  try {
    outputs = model.runSync([buffer]);
  } catch (e) {
    // "Failed to run TFLite Model" on its own says nothing. Attach the three
    // numbers that decide it: the buffer handed in, what the model wants, and
    // which delegate is active.
    throw new Error(
      `${String(e)} | buffer ${buffer.byteLength}B` +
        ` | inputs ${JSON.stringify(model.inputs)}` +
        ` | delegates ${JSON.stringify(model.delegates)}`,
    );
  } finally {
    // Must dispose even on failure: the resizer refuses to run again while a
    // previous GPUFrame is still outstanding.
    resized.dispose();
  }

  return parseDetections(outputs);
}
