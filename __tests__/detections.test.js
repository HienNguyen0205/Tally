const {
  iou,
  mergeDetections,
  passesThreshold,
} = require('../src/shared/detections');
const { FACE_CLASS_ID } = require('../src/shared/constants');

// mergeDetections still compares classId, so it stays correct if a
// multi-class face model ever lands. This stands in for that second class -
// widerfaceyolo26 itself can only ever emit FACE_CLASS_ID.
const OTHER_CLASS = 1;

function box(xmin, ymin, xmax, ymax, score, classId) {
  return { xmin, ymin, xmax, ymax, score, classId };
}

describe('confidence threshold', () => {
  it('keeps a detection sitting exactly on the threshold', () => {
    expect(passesThreshold(box(0, 0, 1, 1, 0.6, FACE_CLASS_ID), 0.6)).toBe(
      true,
    );
  });

  it('drops a detection below the threshold', () => {
    expect(passesThreshold(box(0, 0, 1, 1, 0.59, FACE_CLASS_ID), 0.6)).toBe(
      false,
    );
  });

  // Guards the exact bug that was shipped once: the slider was at 90% yet 73%
  // and 74% objects still showed, because non-person classes got their own
  // lowered threshold.
  it('applies one threshold to every class, favouring none', () => {
    for (const classId of [FACE_CLASS_ID, OTHER_CLASS]) {
      expect(passesThreshold(box(0, 0, 1, 1, 0.73, classId), 0.9)).toBe(false);
      expect(passesThreshold(box(0, 0, 1, 1, 0.91, classId), 0.9)).toBe(true);
    }
  });
});

describe('iou', () => {
  it('is 1 for identical boxes', () => {
    const a = box(0.1, 0.1, 0.5, 0.5, 0.9, FACE_CLASS_ID);
    expect(iou(a, a)).toBeCloseTo(1);
  });

  it('is 0 for disjoint boxes', () => {
    const a = box(0, 0, 0.2, 0.2, 0.9, FACE_CLASS_ID);
    const b = box(0.5, 0.5, 0.9, 0.9, 0.9, FACE_CLASS_ID);
    expect(iou(a, b)).toBe(0);
  });

  it('handles a half-overlap along each edge', () => {
    // Two 0.4 squares offset by 0.2 on each axis: intersection 0.2x0.2 = 0.04,
    // union = 0.16 + 0.16 - 0.04 = 0.28.
    const a = box(0, 0, 0.4, 0.4, 0.9, FACE_CLASS_ID);
    const b = box(0.2, 0.2, 0.6, 0.6, 0.9, FACE_CLASS_ID);
    expect(iou(a, b)).toBeCloseTo(0.04 / 0.28);
  });

  // A collapsed box makes the union zero, and the guard has to return 0 rather
  // than divide by it.
  it('is 0 when a box has no area, instead of NaN', () => {
    const flat = box(0.3, 0.3, 0.3, 0.3, 0.9, FACE_CLASS_ID);
    expect(iou(flat, flat)).toBe(0);
    expect(Number.isNaN(iou(flat, flat))).toBe(false);
  });

  // Decoding cx/cy/w/h can hand back xmax < xmin on a garbage anchor. Area
  // clamps at 0, so this must not come out negative.
  it('never goes negative on an inverted box', () => {
    const inverted = box(0.6, 0.6, 0.2, 0.2, 0.9, FACE_CLASS_ID);
    const normal = box(0.1, 0.1, 0.5, 0.5, 0.9, FACE_CLASS_ID);
    expect(iou(inverted, normal)).toBeGreaterThanOrEqual(0);
  });
});

describe('merging two scan passes', () => {
  const IOU = 0.55;

  it('collapses the same object seen twice, keeping the higher score', () => {
    const wide = [box(0.2, 0.2, 0.6, 0.6, 0.71, FACE_CLASS_ID)];
    const tight = [box(0.21, 0.21, 0.61, 0.61, 0.88, FACE_CLASS_ID)];

    const merged = mergeDetections([wide, tight], IOU);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeCloseTo(0.88);
  });

  // The whole reason for the 'cover' pass: a small object mid-frame that the
  // full-scene pass misses entirely.
  it('keeps an object only one pass saw', () => {
    const wide = [box(0.1, 0.1, 0.3, 0.3, 0.8, FACE_CLASS_ID)];
    const tight = [
      box(0.1, 0.1, 0.3, 0.3, 0.8, FACE_CLASS_ID),
      box(0.7, 0.7, 0.78, 0.78, 0.52, OTHER_CLASS),
    ];

    const merged = mergeDetections([wide, tight], IOU);
    expect(merged).toHaveLength(2);
    expect(merged.some(d => d.classId === OTHER_CLASS)).toBe(true);
  });

  it('keeps two overlapping objects of different classes', () => {
    // Someone holding a cat: near-total overlap, but two real objects.
    const a = box(0.2, 0.2, 0.6, 0.6, 0.9, FACE_CLASS_ID);
    const b = box(0.2, 0.2, 0.6, 0.6, 0.7, OTHER_CLASS);

    expect(mergeDetections([[a], [b]], IOU)).toHaveLength(2);
  });

  it('returns results in descending score order', () => {
    const merged = mergeDetections(
      [
        [box(0, 0, 0.1, 0.1, 0.4, OTHER_CLASS)],
        [box(0.5, 0.5, 0.6, 0.6, 0.95, FACE_CLASS_ID)],
      ],
      IOU,
    );
    expect(merged.map(d => d.score)).toEqual([0.95, 0.4]);
  });

  it('survives empty input', () => {
    expect(mergeDetections([], IOU)).toEqual([]);
    expect(mergeDetections([[], []], IOU)).toEqual([]);
  });

  // Greedy NMS compares against boxes already KEPT, not against everything
  // suppressed. C overlaps the suppressed B but not the kept A, so C stays.
  // Pinning this down because the alternative reading - suppressing anything
  // that touches a discarded box - would silently eat real detections in a
  // crowd.
  it('suppresses against kept boxes only, not discarded ones', () => {
    const a = box(0.0, 0.0, 0.4, 0.4, 0.9, FACE_CLASS_ID);
    const b = box(0.05, 0.05, 0.45, 0.45, 0.8, FACE_CLASS_ID); // eaten by A
    const c = box(0.3, 0.3, 0.7, 0.7, 0.7, FACE_CLASS_ID); // overlaps B, not A

    const merged = mergeDetections([[a, b, c]], IOU);
    expect(merged.map(d => d.score)).toEqual([0.9, 0.7]);
  });

  it('merges more than two passes', () => {
    const merged = mergeDetections(
      [
        [box(0, 0, 0.2, 0.2, 0.9, FACE_CLASS_ID)],
        [box(0.3, 0.3, 0.5, 0.5, 0.8, OTHER_CLASS)],
        [box(0.6, 0.6, 0.8, 0.8, 0.7, FACE_CLASS_ID)],
      ],
      IOU,
    );
    expect(merged).toHaveLength(3);
  });
});
