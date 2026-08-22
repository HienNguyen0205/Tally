const {
  landmarksToReading,
  fivePoints,
  MESH_POINTS,
} = require('../src/detection/meshLandmarks');
const { MESH_SIZE } = require('../src/shared/constants');

// The landmark indices the pose maths reads, mirrored from faceMesh.ts. Left
// and right are the image's, not the subject's.
const EYE_L = 263;
const EYE_R = 33;
const FOREHEAD = 10;
const CHIN = 152;

/**
 * A synthetic face in pixels of the 192 square: eyes level either side of
 * centre, forehead above, chin below, everything at depth 0 unless a test says
 * otherwise.
 */
function face(overrides = {}) {
  const raw = new Float32Array(MESH_POINTS * 3).fill(MESH_SIZE / 2);
  const put = (i, x, y, z) => {
    raw[i * 3] = x;
    raw[i * 3 + 1] = y;
    raw[i * 3 + 2] = z;
  };
  put(EYE_R, 60, 80, 0);
  put(EYE_L, 132, 80, 0);
  put(FOREHEAD, 96, 30, 0);
  put(CHIN, 96, 170, 0);

  for (const [index, point] of Object.entries(overrides)) {
    put(Number(index), point.x, point.y, point.z ?? 0);
  }
  return raw;
}

const CROP = { left: 100, top: 200, width: 384, height: 384 };
const IMAGE = { w: 1000, h: 2000 };

const read = raw => landmarksToReading(raw, 0.99, CROP, IMAGE.w, IMAGE.h);

describe('reading FaceMesh landmarks', () => {
  it('maps landmarks off the 192 square and onto the image', () => {
    const out = read(face());

    // The right eye sits at 60/192 across the crop, and the crop starts 100px
    // into a 1000px-wide image.
    expect(out.points[EYE_R * 2]).toBeCloseTo(
      (100 + (60 / MESH_SIZE) * 384) / 1000,
      6,
    );
    expect(out.points[EYE_R * 2 + 1]).toBeCloseTo(
      (200 + (80 / MESH_SIZE) * 384) / 2000,
      6,
    );
    expect(out.points).toHaveLength(MESH_POINTS * 2);
  });

  it('accepts already-normalised landmarks without dividing them twice', () => {
    // Same face, expressed in 0..1. Dividing this by 192 as well would collapse
    // every point into the crop's top-left corner - a mask that looks like a
    // single dot, with no error anywhere.
    const raw = face();
    const normalised = raw.map(v => v / MESH_SIZE);

    const a = read(raw);
    const b = read(Float32Array.from(normalised));
    expect(b.points[EYE_R * 2]).toBeCloseTo(a.points[EYE_R * 2], 6);
    expect(b.points[EYE_L * 2 + 1]).toBeCloseTo(a.points[EYE_L * 2 + 1], 6);
  });

  it('reads a level, face-on head as no rotation at all', () => {
    const out = read(face());
    expect(out.roll).toBeCloseTo(0, 6);
    expect(out.yaw).toBeCloseTo(0, 6);
    expect(out.pitch).toBeCloseTo(0, 6);
  });

  it('measures roll from the eye line', () => {
    // The eyes are 72 apart; dropping one by 72 puts the line at 45 degrees.
    const raw = face();
    raw[EYE_L * 3 + 1] = 80 + 72;

    const out = read(raw);
    expect(out.roll).toBeCloseTo(Math.PI / 4, 6);
    // A tilt is not a turn: yaw must stay put.
    expect(out.yaw).toBeCloseTo(0, 6);
  });

  it('reads a turned head as yaw, in the crop square where x and z agree', () => {
    // The left side of the face falls away from the camera by half the eye
    // separation - about 27 degrees of turn.
    const raw = face();
    raw[EYE_L * 3 + 2] = 36;
    const out = read(raw);

    expect(out.yaw).toBeCloseTo(Math.atan2(36, 72), 6);
    expect(Math.abs(out.yaw)).toBeGreaterThan(0.4);
    // A turn is not a tilt: roll must stay put.
    expect(out.roll).toBeCloseTo(0, 6);
  });

  it('reads a tipped head as pitch, not as yaw', () => {
    const raw = face();
    raw[CHIN * 3 + 2] = 45;
    const out = read(raw);

    // Forehead to chin is 140 apart in this face, not the eye separation.
    expect(out.pitch).toBeCloseTo(Math.atan2(45, 140), 6);
    expect(out.yaw).toBeCloseTo(0, 6);
  });

  it('keeps the crop-square scale out of the image aspect ratio', () => {
    // Same landmarks, same square crop, but a much wider image: the angles
    // describe the face, so they must not move when the frame does.
    const raw = face();
    raw[EYE_L * 3 + 2] = 36;

    const tall = landmarksToReading(raw, 0.99, CROP, 1000, 4000);
    const wide = landmarksToReading(raw, 0.99, CROP, 4000, 1000);
    expect(tall.yaw).toBeCloseTo(wide.yaw, 9);
    expect(tall.pitch).toBeCloseTo(wide.pitch, 9);
    expect(tall.roll).toBeCloseTo(wide.roll, 9);
  });
});

describe('the five points ArcFace aligns on', () => {
  // A crop 384px wide starting 100px into a 1000px image, encoded at 224.
  const CROP2 = { left: 100, top: 200, width: 384, height: 384 };
  const SIZE = 224;

  // Landmarks live in the IMAGE's 0..1 space; the server sees only the crop.
  function pointsAt(spec) {
    const pts = new Float32Array(MESH_POINTS * 2).fill(0.5);
    for (const [i, [x, y]] of Object.entries(spec)) {
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
    }
    return pts;
  }

  it('rebases image coordinates onto the crop it actually sends', () => {
    // Nose at the exact centre of the crop: (100 + 192) / 1000 across.
    const pts = pointsAt({ 1: [292 / 1000, 392 / 2000] });
    const five = fivePoints(pts, CROP2, 1000, 2000, SIZE);

    expect(five[2][0]).toBeCloseTo(SIZE / 2, 4);
    expect(five[2][1]).toBeCloseTo(SIZE / 2, 4);
  });

  it('averages each eye from its two corners', () => {
    // Eye corners at 0.2 and 0.3 across -> centre at 0.25. Everything else
    // defaults to 0.5, so this eye is the left-hand one.
    const pts = pointsAt({ 33: [0.2, 0.4], 133: [0.3, 0.4] });
    const five = fivePoints(pts, CROP2, 1000, 2000, SIZE);

    const expected = ((0.25 * 1000 - 100) * SIZE) / 384;
    expect(five[0][0]).toBeCloseTo(expected, 4);
  });

  it('orders each pair by x, whichever way the camera mirrored the face', () => {
    // The same face twice, once with the eye indices on opposite sides - which
    // is exactly what a front camera does. ArcFace's template is not
    // mirror-symmetric and a similarity transform cannot mirror, so a swapped
    // pair does not fail loudly: it fits a compromise and the embedding drifts.
    const normal = pointsAt({
      33: [0.3, 0.4],
      133: [0.3, 0.4],
      362: [0.6, 0.4],
      263: [0.6, 0.4],
      61: [0.35, 0.6],
      291: [0.55, 0.6],
    });
    const mirrored = pointsAt({
      33: [0.6, 0.4],
      133: [0.6, 0.4],
      362: [0.3, 0.4],
      263: [0.3, 0.4],
      61: [0.55, 0.6],
      291: [0.35, 0.6],
    });

    const a = fivePoints(normal, CROP2, 1000, 2000, SIZE);
    const b = fivePoints(mirrored, CROP2, 1000, 2000, SIZE);

    expect(a[0][0]).toBeCloseTo(b[0][0], 6);
    expect(a[1][0]).toBeCloseTo(b[1][0], 6);
    expect(a[3][0]).toBeCloseTo(b[3][0], 6);
    expect(a[4][0]).toBeCloseTo(b[4][0], 6);
    expect(a[0][0]).toBeLessThan(a[1][0]);
    expect(b[0][0]).toBeLessThan(b[1][0]);
  });

  it('returns the five in template order, left eye first', () => {
    // Left eye further left in the image than the right one. The server can
    // swap for a mirrored front camera, but only if the order starts fixed.
    const pts = pointsAt({
      33: [0.3, 0.4],
      133: [0.3, 0.4],
      362: [0.6, 0.4],
      263: [0.6, 0.4],
      1: [0.45, 0.5],
      61: [0.35, 0.6],
      291: [0.55, 0.6],
    });
    const five = fivePoints(pts, CROP2, 1000, 2000, SIZE);

    expect(five).toHaveLength(5);
    expect(five[0][0]).toBeLessThan(five[1][0]); // eyes
    expect(five[3][0]).toBeLessThan(five[4][0]); // mouth corners
    expect(five[2][1]).toBeGreaterThan(five[0][1]); // nose below the eyes
  });
});
