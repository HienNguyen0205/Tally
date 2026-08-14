const { boxToScreen, toFrameBox } = require('../src/shared/boxLayout');

/**
 * A hit region drifting from the box that was drawn is a very hard bug to catch
 * by eye (taps miss by a few dozen pixels), so it gets pinned numerically at
 * characteristic landmarks.
 *
 * boxToScreen takes a box ALREADY in frame space - the letterbox leg is
 * toFrameBox's job.
 */
describe('mapping boxes onto screen coordinates', () => {
  // 720x1280 portrait frame, 1080x2460 screen - the test device's real setup.
  const FW = 720;
  const FH = 1280;
  const SW = 1080;
  const SH = 2460;

  const full = { xmin: 0, ymin: 0, xmax: 1, ymax: 1 };

  it('fills the screen height when the box fills the frame', () => {
    const r = boxToScreen(full, FW, FH, SW, SH);
    // fit="cover": the screen is taller than the frame's ratio, so it scales by
    // height and trims the sides.
    expect(r.top).toBeCloseTo(0, 5);
    expect(r.height).toBeCloseTo(SH, 5);
    // The width spills past both edges - that spill is exactly what gets cut.
    expect(r.left).toBeLessThan(0);
    expect(r.width).toBeGreaterThan(SW);
  });

  it('puts the box centre on the screen centre', () => {
    const mid = { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.5 };
    const r = boxToScreen(mid, FW, FH, SW, SH);
    expect(r.left).toBeCloseTo(SW / 2, 5);
    expect(r.top).toBeCloseTo(SH / 2, 5);
  });

  it('preserves aspect: a square in frame space stays square on screen', () => {
    // Square in frame space means the normalised width must be smaller than the
    // height by exactly the frame's ratio.
    const square = { xmin: 0.3, ymin: 0.3, xmax: 0.5, ymax: 0.3 + 0.2 * (FW / FH) };
    const r = boxToScreen(square, FW, FH, SW, SH);
    expect(r.width).toBeCloseTo(r.height, 5);
  });

  it('holds up in landscape', () => {
    const mid = { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.5 };
    const r = boxToScreen(mid, 1280, 720, 2460, 1080);
    expect(r.left).toBeCloseTo(2460 / 2, 5);
    expect(r.top).toBeCloseTo(1080 / 2, 5);
  });

  it('end to end: a model box filling the square fills the screen', () => {
    // The letterbox square covers everything, so both legs together must land on
    // exactly the screen height.
    const frameBox = toFrameBox(
      { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
      'contain',
      FW,
      FH,
    );
    const r = boxToScreen(frameBox, FW, FH, SW, SH);
    expect(r.top).toBeCloseTo(0, 5);
    expect(r.height).toBeCloseTo(SH, 5);
  });
});
