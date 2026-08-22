const {
  trackFaces,
  livingTracks,
  EMPTY_TRACKS,
} = require('../src/shared/tracker');

const box = (xmin, ymin, size = 0.2, score = 0.9) => ({
  xmin,
  ymin,
  xmax: xmin + size,
  ymax: ymin + size,
  score,
  classId: 0,
});

/** Runs several rounds of detections through the tracker. */
const feed = (rounds, state = EMPTY_TRACKS) =>
  rounds.reduce((s, detections) => trackFaces(s, detections), state);

describe('following faces between detection rounds', () => {
  it('keeps one id while a face drifts across the frame', () => {
    const state = feed([
      [box(0.1, 0.1)],
      [box(0.13, 0.1)],
      [box(0.16, 0.11)],
      [box(0.19, 0.12)],
    ]);

    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].id).toBe(1);
    // The box follows even though the id does not change.
    expect(state.tracks[0].box.xmin).toBeCloseTo(0.19, 6);
  });

  it('gives a genuinely new face a new id', () => {
    const state = feed([[box(0.1, 0.1)], [box(0.1, 0.1), box(0.6, 0.6)]]);

    expect(state.tracks.map(t => t.id)).toEqual([1, 2]);
  });

  it('does not let one detection claim two tracks', () => {
    // Two faces, then a single box overlapping both. Only the better match may
    // take it; the other has to age out rather than share.
    const state = feed([[box(0.1, 0.1), box(0.25, 0.1)], [box(0.12, 0.1)]]);

    const matched = state.tracks.filter(t => t.missed === 0);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(1);
    expect(state.tracks).toHaveLength(2); // the other is ageing, not gone
  });

  it('takes the strongest overlap, not the first in the array', () => {
    // The second track sits exactly where the new detection lands; the first
    // merely brushes it. Order in the array must not decide this.
    const state = feed([[box(0.3, 0.3), box(0.42, 0.3)], [box(0.42, 0.3)]]);

    const matched = state.tracks.filter(t => t.missed === 0);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(2);
  });

  it('holds a briefly missed face, then forgets it', () => {
    let state = feed([[box(0.1, 0.1)]]);
    expect(livingTracks(state)).toHaveLength(1);

    // One missed round is still DRAWN, at its last box. A blink must not
    // blank the box and the count and then bring them back - that flicker is
    // the whole reason livingTracks is tolerant.
    state = trackFaces(state, []);
    expect(livingTracks(state)).toHaveLength(1);

    // A second one is still tracked - recognition keeps its answer - but no
    // longer drawn, because by now the box is too old to trust.
    state = trackFaces(state, []);
    expect(state.tracks).toHaveLength(1);
    expect(livingTracks(state)).toHaveLength(0);

    state = trackFaces(state, []);
    expect(state.tracks).toHaveLength(0);
  });

  it('reuses the id when the face comes back inside the grace period', () => {
    let state = feed([[box(0.1, 0.1)]]);
    state = trackFaces(state, []); // one missed round
    state = trackFaces(state, [box(0.11, 0.1)]);

    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].id).toBe(1);
    expect(state.tracks[0].missed).toBe(0);
  });

  it('treats a face that jumped clear across the frame as a new one', () => {
    // No overlap at all - the same person or not, nothing here can tell, and
    // guessing would put someone else's name on the box.
    const state = feed([[box(0.1, 0.1)], [box(0.7, 0.7)]]);

    expect(state.tracks.map(t => t.id).sort()).toEqual([1, 2]);

    // Both are drawn for this one round: the old track is on its grace round
    // and does not know its face has gone. That is the price of not blinking
    // on every missed detection, and it is paid for exactly one round.
    expect(livingTracks(state).map(t => t.id)).toEqual([1, 2]);
    expect(
      livingTracks(trackFaces(state, [box(0.7, 0.7)])).map(t => t.id),
    ).toEqual([2]);
  });

  // React re-renders on identity, not on contents. An empty round that built a
  // fresh `{tracks: [], nextId}` repainted the whole viewfinder several times a
  // second while the camera looked at an empty room - and repainting the
  // viewfinder is what made its preview flicker.
  it('returns the SAME state object when a round changes nothing', () => {
    const idle = trackFaces(EMPTY_TRACKS, []);
    expect(idle).toBe(EMPTY_TRACKS);
    expect(trackFaces(idle, [])).toBe(idle);
  });

  it('still returns a new object the moment anything moves', () => {
    const one = trackFaces(EMPTY_TRACKS, [box(0.1, 0.1)]);
    expect(one).not.toBe(EMPTY_TRACKS);
    // A matched track carries a new box, so the round counts as changed even
    // though the id and missed count are identical.
    expect(trackFaces(one, [box(0.11, 0.1)])).not.toBe(one);
    // ...and so does a track ageing towards being forgotten.
    expect(trackFaces(one, [])).not.toBe(one);
  });

  it('never hands out an id twice', () => {
    let state = EMPTY_TRACKS;
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      // Everything moves far enough each round that nothing ever matches.
      state = trackFaces(state, [box(0.05 + (i % 2) * 0.6, 0.05)]);
      state.tracks.forEach(t => seen.add(t.id));
    }
    expect(seen.size).toBe(state.nextId - 1);
  });

  it('leaves the input alone', () => {
    const first = [box(0.1, 0.1)];
    const state = trackFaces(EMPTY_TRACKS, first);
    trackFaces(state, [box(0.5, 0.5)]);

    expect(EMPTY_TRACKS.tracks).toHaveLength(0);
    expect(state.tracks).toHaveLength(1);
  });
});
