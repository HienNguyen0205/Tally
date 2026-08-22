const React = require('react');
const TestRenderer = require('react-test-renderer');
const { View } = require('react-native');

// Both stand between this hook and a device: faceEmbed pulls in Skia and
// TFLite, faceProfiles pulls in Supabase. Mocked here so the hook's state
// machine can be driven on its own, which is the only part that has ever
// gone wrong in it.
jest.mock('../src/detection/faceEmbed', () => ({ readFace: jest.fn() }));
jest.mock('../src/shared/faceProfiles', () => ({
  fetchProfiles: jest.fn(async () => []),
}));

const { readFace } = require('../src/detection/faceEmbed');
const { useFaceIdentity } = require('../src/hooks/useFaceIdentity');

const track = (id, missed = 0) => ({
  id,
  missed,
  box: { xmin: 0.1, ymin: 0.1, xmax: 0.3, ymax: 0.3, score: 0.9, classId: 0 },
});

/** A stand-in for the screen: it re-renders on every detection round, handing
 *  the hook a NEW array each time, exactly as `livingTracks` does. */
function Harness({ tracks, onRender }) {
  onRender();
  useFaceIdentity({}, tracks, () => ({}), true);
  return React.createElement(View, null);
}

/** Feeds the hook one detection round and lets its promises settle. */
async function round(renderer, tracks, onRender) {
  await TestRenderer.act(async () => {
    renderer.update(
      React.createElement(Harness, { tracks: [...tracks], onRender }),
    );
  });
}

describe('useFaceIdentity as a state machine', () => {
  beforeEach(() => {
    readFace.mockReset();
    readFace.mockResolvedValue({
      ok: true,
      reading: { embedding: [1], points: new Float32Array(4) },
    });
  });

  it('settles instead of re-rendering forever while faces hold still', async () => {
    let renders = 0;
    const count = () => {
      renders += 1;
    };
    const faces = [track(1), track(2)];

    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, { tracks: [...faces], onRender: count }),
      );
    });

    // Ten rounds with nothing changing but the array's identity - which is
    // what the screen really hands over, on every detection round.
    for (let i = 0; i < 10; i++) await round(renderer, faces, count);

    // Two faces need two reads; everything after that should be one render per
    // round. A number in the hundreds means an effect is feeding itself.
    expect(renders).toBeLessThan(40);
    expect(readFace).toHaveBeenCalledTimes(2);
  });

  it('does not re-read a face that blinks out for a round and comes back', async () => {
    let renderer;
    const noop = () => {};
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, { tracks: [track(1)], onRender: noop }),
      );
    });

    // Missed one round: the tracker keeps it with missed=1, which is exactly
    // what the hook is given - the screen hands over every track, not just the
    // ones being drawn. Then it is back.
    await round(renderer, [track(1, 1)], noop);
    await round(renderer, [track(1)], noop);
    await round(renderer, [track(1)], noop);

    // One read. Re-reading on every blink is a server round trip per blink,
    // and the name flickering off the box while it happens.
    expect(readFace).toHaveBeenCalledTimes(1);
  });

  it('keeps working when a face leaves while it is being read', async () => {
    let resolveRead;
    readFace.mockReturnValue(
      new Promise(resolve => {
        resolveRead = resolve;
      }),
    );

    let renders = 0;
    const count = () => {
      renders += 1;
    };
    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, { tracks: [track(1)], onRender: count }),
      );
    });

    await round(renderer, [], count); // gone mid-read
    await TestRenderer.act(async () => {
      resolveRead({
        ok: true,
        reading: { embedding: [1], points: new Float32Array(4) },
      });
    });

    const settled = renders;
    for (let i = 0; i < 5; i++) await round(renderer, [], count);
    expect(renders - settled).toBeLessThan(12);
  });
});

describe('useFaceIdentity under churn', () => {
  it('survives faces appearing and vanishing every round', async () => {
    // What a real viewfinder does at 2Hz: ids come and go as detection
    // jitters, and with no embedding server every read fails fast.
    readFace.mockReset();
    readFace.mockRejectedValue(new Error('no server'));

    let renders = 0;
    const count = () => {
      renders += 1;
    };

    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, { tracks: [track(1)], onRender: count }),
      );
    });

    const sets = [
      [track(1), track(2)],
      [track(2), track(3)],
      [track(3)],
      [track(3), track(4), track(5)],
      [track(5)],
      [],
    ];
    for (let i = 0; i < 30; i++) {
      await round(renderer, sets[i % sets.length], count);
    }

    // Thirty rounds. Each may legitimately cost a handful of renders; an
    // effect feeding itself costs hundreds.
    expect(renders).toBeLessThan(200);
  });
});
