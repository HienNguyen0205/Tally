const { parseDetections } = require('../src/detection/runModel');
const {
  NUM_CLASSES,
  MAX_DETECTIONS,
  RAW_SCORE_FLOOR,
} = require('../src/shared/constants');

const CHANNELS = NUM_CLASSES + 4;

/**
 * Builds a fake output in the exact [1, 84, N] layout of a non-end2end export:
 * CHANNEL-major, so channel c at anchor a sits at `c * N + a`.
 *
 * Getting it backwards as `a * 84 + c` is a bug with no error message - boxes
 * still come out, just in the wrong places - so it gets pinned by test. An
 * end2end export instead produces a completely different `[1, 300, 6]`; check
 * the shape before swapping models.
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
        { anchor: 5, cx: 0.5, cy: 0.4, w: 0.2, h: 0.6, classId: 3, score: 0.9 },
      ]),
    );

    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(3);
    expect(found[0].score).toBeCloseTo(0.9);
    expect(found[0].xmin).toBeCloseTo(0.4);
    expect(found[0].xmax).toBeCloseTo(0.6);
    expect(found[0].ymin).toBeCloseTo(0.1);
    expect(found[0].ymax).toBeCloseTo(0.7);
  });

  it('keeps only the top-scoring class per anchor', () => {
    const anchors = 4;
    const out = new Float32Array(CHANNELS * anchors);
    out[0 * anchors + 1] = 0.5; // cx
    out[1 * anchors + 1] = 0.5; // cy
    out[2 * anchors + 1] = 0.1; // w
    out[3 * anchors + 1] = 0.1; // h
    out[(4 + 7) * anchors + 1] = 0.4;
    out[(4 + 12) * anchors + 1] = 0.85; // the winner
    out[(4 + 20) * anchors + 1] = 0.3;

    const found = parseDetections([out.buffer]);
    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(12);
    expect(found[0].score).toBeCloseTo(0.85);
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
          classId: 1,
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
        classId: a % NUM_CLASSES,
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
