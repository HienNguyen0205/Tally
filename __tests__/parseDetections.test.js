const { parseDetections } = require('../src/detection/runModel');
const {
  NUM_CLASSES,
  MAX_DETECTIONS,
  RAW_SCORE_FLOOR,
} = require('../src/shared/constants');

const CHANNELS = NUM_CLASSES + 4;

/**
 * Builds a fake output in the exact [1, 5, N] layout of a non-end2end export:
 * CHANNEL-major, so channel c at anchor a sits at `c * N + a`.
 *
 * 5 channels because widerfaceyolo26 is single-class - 4 box coordinates plus
 * one face score, where the COCO detector had 84. Getting the layout backwards
 * as `a * 5 + c` is a bug with no error message - boxes still come out, just in
 * the wrong places - so it gets pinned by test. An end2end export instead
 * produces a completely different `[1, 300, 6]`; check the shape before
 * swapping models.
 */
function buildOutput(anchors, boxes) {
  const out = new Float32Array(CHANNELS * anchors);
  const put = (c, a, v) => {
    out[c * anchors + a] = v;
  };

  for (const { anchor, cx, cy, w, h, classId, score } of boxes) {
    put(0, anchor, cx);
    put(1, anchor, cy);
    put(2, anchor, w);
    put(3, anchor, h);
    put(4 + classId, anchor, score);
  }
  return [out.buffer];
}

describe('decoding raw anchor output', () => {
  it('reads the channel layout and turns centre+size into two corners', () => {
    const found = parseDetections(
      buildOutput(10, [
        { anchor: 5, cx: 0.5, cy: 0.4, w: 0.2, h: 0.6, classId: 0, score: 0.9 },
      ]),
    );

    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(0);
    expect(found[0].score).toBeCloseTo(0.9);
    expect(found[0].xmin).toBeCloseTo(0.4);
    expect(found[0].xmax).toBeCloseTo(0.6);
    expect(found[0].ymin).toBeCloseTo(0.1);
    expect(found[0].ymax).toBeCloseTo(0.7);
  });

  // The decode still walks a class loop even though the loop has one turn -
  // that is what keeps it correct if a multi-class face model ever lands. This
  // pins that the single channel is read as the score, not as a coordinate.
  it('reads the one class channel as the score', () => {
    const anchors = 4;
    const out = new Float32Array(CHANNELS * anchors);
    out[0 * anchors + 1] = 0.5; // cx
    out[1 * anchors + 1] = 0.5; // cy
    out[2 * anchors + 1] = 0.1; // w
    out[3 * anchors + 1] = 0.1; // h
    out[4 * anchors + 1] = 0.85;

    const found = parseDetections([out.buffer]);
    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(0);
    expect(found[0].score).toBeCloseTo(0.85);
  });

  // Pins the shape the decode assumes against the tensor the file actually
  // declares - [1, 5, 8400], read straight out of widerfaceyolo26.tflite.
  it('has exactly the five channels the model emits', () => {
    expect(CHANNELS).toBe(5);
  });

  it('drops anchors below the hard floor', () => {
    const found = parseDetections(
      buildOutput(6, [
        {
          anchor: 2,
          cx: 0.5,
          cy: 0.5,
          w: 0.1,
          h: 0.1,
          classId: 0,
          score: RAW_SCORE_FLOOR / 2,
        },
      ]),
    );
    expect(found).toHaveLength(0);
  });

  it('returns descending scores and truncates at MAX_DETECTIONS', () => {
    const anchors = MAX_DETECTIONS + 30;
    const boxes = [];
    for (let a = 0; a < anchors; a++) {
      boxes.push({
        anchor: a,
        cx: 0.5,
        cy: 0.5,
        w: 0.05,
        h: 0.05,
        classId: 0,
        // Later anchors score higher, to prove a real sort happened.
        score: 0.2 + (a / anchors) * 0.7,
      });
    }

    const found = parseDetections(buildOutput(anchors, boxes));
    expect(found).toHaveLength(MAX_DETECTIONS);
    expect(found[0].score).toBeGreaterThan(found[found.length - 1].score);
    // Truncation must keep the HIGHEST-scoring group, not the head of the array.
    expect(found[0].score).toBeCloseTo(0.2 + ((anchors - 1) / anchors) * 0.7);
  });
});
