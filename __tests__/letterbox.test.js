const { modelDestRect, toFrameBox } = require('../src/shared/boxLayout');

/**
 * Checks the mapping of box coordinates out of the model's square and into frame
 * space. Drift of a few dozen pixels is very hard to spot by eye on a real
 * device, so it gets pinned numerically.
 *
 * The two passes use two different squares ('contain' keeps the whole frame plus
 * black bars, 'cover' takes the centre square), and this is the only place that
 * knows the difference - get it wrong here and everything downstream shifts with
 * it, with no error raised.
 */
// The box's midpoint, in frame space (0..1).
function centerOf(box) {
  return { x: (box.xmin + box.xmax) / 2, y: (box.ymin + box.ymax) / 2 };
}

// A box collapsed to a single point, to check the per-point mapping.
function point(x, y) {
  return { xmin: x, ymin: y, xmax: x, ymax: y };
}

describe("mapping into frame space - 'contain' (letterbox)", () => {
  // The app's default portrait frame: 720x1280 (HD_16_9 once rotated upright).
  const W = 720;
  const H = 1280;
  // Black bar on each side: (1280-720)/2 = 280px -> normalised 280/1280.
  const padX = (H - W) / 2 / H;

  it('puts the square centre on the frame centre', () => {
    const c = centerOf(toFrameBox(point(0.5, 0.5), 'contain', W, H));
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });

  it('compensates for the black bars on both sides', () => {
    expect(
      centerOf(toFrameBox(point(padX, 0.5), 'contain', W, H)).x,
    ).toBeCloseTo(0);
    expect(
      centerOf(toFrameBox(point(1 - padX, 0.5), 'contain', W, H)).x,
    ).toBeCloseTo(1);
  });

  // The crux: 'cover' on its own used to cut the top and bottom off entirely.
  it('reaches all the way to the top and bottom of the frame', () => {
    expect(centerOf(toFrameBox(point(0.5, 0), 'contain', W, H)).y).toBeCloseTo(
      0,
    );
    expect(centerOf(toFrameBox(point(0.5, 1), 'contain', W, H)).y).toBeCloseTo(
      1,
    );
  });

  it('holds up in landscape', () => {
    const c = centerOf(
      toFrameBox(point(0.5, (1280 - 720) / 2 / 1280), 'contain', 1280, 720),
    );
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0);
  });
});

describe("mapping into frame space - 'cover' (centre crop)", () => {
  const W = 720;
  const H = 1280;
  // A 720 square centred in a 1280-tall frame crops (1280-720)/2 = 280px off
  // each end, i.e. 280/1280 of the height.
  const cropY = (H - W) / 2 / H;

  it('still puts the square centre on the frame centre', () => {
    const c = centerOf(toFrameBox(point(0.5, 0.5), 'cover', W, H));
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });

  it('uses the full width, with no bars', () => {
    expect(centerOf(toFrameBox(point(0, 0.5), 'cover', W, H)).x).toBeCloseTo(0);
    expect(centerOf(toFrameBox(point(1, 0.5), 'cover', W, H)).x).toBeCloseTo(1);
  });

  it('keeps the square top inside the frame - the crop must be added back', () => {
    expect(centerOf(toFrameBox(point(0.5, 0), 'cover', W, H)).y).toBeCloseTo(
      cropY,
    );
    expect(centerOf(toFrameBox(point(0.5, 1), 'cover', W, H)).y).toBeCloseTo(
      1 - cropY,
    );
  });

  it('lands both passes on the same spot for one object mid-frame', () => {
    // An object filling half the 'cover' square must, in frame space, coincide
    // with the matching box from the 'contain' pass. That coincidence is exactly
    // what lets NMS merge them.
    const tight = toFrameBox(
      { xmin: 0.25, ymin: 0.25, xmax: 0.75, ymax: 0.75 },
      'cover',
      W,
      H,
    );
    // The same region seen from the 'contain' square: side 1280, centred on the
    // frame centre. The object is a square of side W/2 = 360px, expressed
    // against the 1280 square.
    const side = W / 2 / H;
    const wide = toFrameBox(
      {
        xmin: 0.5 - side / 2,
        ymin: 0.5 - side / 2,
        xmax: 0.5 + side / 2,
        ymax: 0.5 + side / 2,
      },
      'contain',
      W,
      H,
    );

    expect(tight.xmin).toBeCloseTo(wide.xmin, 5);
    expect(tight.ymin).toBeCloseTo(wide.ymin, 5);
    expect(tight.xmax).toBeCloseTo(wide.xmax, 5);
    expect(tight.ymax).toBeCloseTo(wide.ymax, 5);
  });
});

/**
 * The library-photo path builds its input with Skia rather than the resizer, so
 * the way it places the image into the model's square must match EXACTLY the
 * convention toFrameBox assumes. Drift here makes boxes on library photos
 * systematically wrong, with no error raised.
 */
describe('modelDestRect agrees with toFrameBox', () => {
  const SIZE = 448;

  // Normalised point in the model square -> image pixel, worked back from dest.
  function pixelFromDest(dest, u, imageSize, axis) {
    const offset = axis === 'x' ? dest.left : dest.top;
    const drawn = axis === 'x' ? dest.width : dest.height;
    return ((u * SIZE - offset) * imageSize) / drawn;
  }

  for (const space of ['contain', 'cover']) {
    for (const [W, H] of [
      [720, 1280],
      [1280, 720],
      [1000, 1000],
      [4032, 3024],
    ]) {
      it(`'${space}' ${W}x${H}: both routes point at the same pixel`, () => {
        const dest = modelDestRect(W, H, space, SIZE);

        for (const u of [0, 0.25, 0.5, 0.9, 1]) {
          const viaFrameBox = toFrameBox(
            { xmin: u, ymin: u, xmax: u, ymax: u },
            space,
            W,
            H,
          );
          expect(pixelFromDest(dest, u, W, 'x')).toBeCloseTo(
            viaFrameBox.xmin * W,
            4,
          );
          expect(pixelFromDest(dest, u, H, 'y')).toBeCloseTo(
            viaFrameBox.ymin * H,
            4,
          );
        }
      });
    }
  }
});
