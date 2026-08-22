const {
  EMBEDDING_SIZE,
  MATCH_THRESHOLD,
  MAX_PITCH,
  MAX_YAW,
  bestMatch,
  normalise,
  poseUsable,
  similarity,
} = require('../src/shared/faceMatch');

/** A deterministic unit-ish vector, so tests do not depend on Math.random. */
function vec(seed, size = EMBEDDING_SIZE) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(Math.sin(seed * (i + 1)) + 0.001);
  return normalise(out);
}

/** The model every profile in these tests was enrolled under, unless a test
 *  is specifically about the mismatch. */
const MODEL = 'w600k_r50';

function profile(userId, embedding, model = MODEL) {
  return { userId, displayName: userId, embeddings: [embedding], model };
}

describe('normalise', () => {
  it('scales to unit length', () => {
    const n = normalise([3, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
    expect(Math.hypot(...n)).toBeCloseTo(1);
  });

  // A zero embedding means the model ran on something it could not read.
  // Dividing anyway yields NaNs, which compare as "not a match" everywhere and
  // would look exactly like an unrecognised face rather than a broken one.
  it('refuses a zero vector instead of producing NaN', () => {
    expect(normalise([0, 0, 0])).toBeNull();
  });

  it('refuses a vector with a non-finite entry', () => {
    expect(normalise([1, NaN, 2])).toBeNull();
    expect(normalise([1, Infinity])).toBeNull();
  });
});

describe('similarity', () => {
  it('is 1 for the same direction and -1 for the opposite', () => {
    const a = normalise([1, 2, 3]);
    const flipped = a.map(x => -x);
    expect(similarity(a, a)).toBeCloseTo(1);
    expect(similarity(a, flipped)).toBeCloseTo(-1);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(similarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  // Comparing a 512-d embedding against a 128-d one means two different models
  // are in play. Scoring it -1 keeps it below every threshold rather than
  // reading whichever prefix happens to line up.
  it('rejects a length mismatch outright', () => {
    expect(similarity([1, 0, 0], [1, 0])).toBe(-1);
  });
});

describe('bestMatch', () => {
  const alice = vec(1);
  const bob = vec(2);

  it('finds the enrolled profile a face belongs to', () => {
    const m = bestMatch(alice, MODEL, [
      profile('bob', bob),
      profile('alice', alice),
    ]);
    expect(m.profile.userId).toBe('alice');
    expect(m.similarity).toBeCloseTo(1);
  });

  it('returns null when nobody clears the threshold', () => {
    expect(bestMatch(alice, MODEL, [profile('bob', bob)])).toBeNull();
  });

  it('returns null against an empty enrolment list', () => {
    expect(bestMatch(alice, MODEL, [])).toBeNull();
  });

  // The whole point of a threshold: a stranger must come back unknown, never
  // be handed somebody else's identity.
  it('does not match a stranger to the closest enrolled face', () => {
    const strangers = [profile('bob', bob), profile('carol', vec(3))];
    expect(bestMatch(vec(4), MODEL, strangers)).toBeNull();
  });

  it('picks the highest score when several clear the threshold', () => {
    // A vector nudged slightly off alice still resembles her far more than bob.
    const nudged = normalise(alice.map((x, i) => x + (i % 7 === 0 ? 0.02 : 0)));
    const m = bestMatch(nudged, MODEL, [
      profile('alice', alice),
      profile('alice-old', normalise(alice.map(x => x + 0.05))),
    ]);
    expect(m.similarity).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(['alice', 'alice-old']).toContain(m.profile.userId);
  });

  // The failure this guard exists for: the SAME 512 numbers, produced by a
  // different model, are not a weaker match - they are a number computed from
  // nothing. Scoring them at all is how a stranger gets somebody's name.
  it('will not match a profile enrolled under another model', () => {
    const other = [profile('alice', alice, 'arcface-tflite-v1')];
    expect(bestMatch(alice, MODEL, other)).toBeNull();
    // ...and it is the model that stopped it, not the score: identical
    // vectors would otherwise sit at similarity 1.
    expect(bestMatch(alice, 'arcface-tflite-v1', other)).not.toBeNull();
  });

  it('skips the wrong model even when it would have scored higher', () => {
    const m = bestMatch(alice, MODEL, [
      profile('impostor', alice, 'some-other-model'),
      profile(
        'alice',
        normalise(alice.map((x, i) => x + (i % 5 === 0 ? 0.04 : 0))),
      ),
    ]);
    expect(m.profile.userId).toBe('alice');
  });

  // Enrolment stores several angles of one person in one row. A scan that
  // resembles the turned shot but not the straight-on one is still that
  // person - which is the entire reason the angles are kept apart instead of
  // averaged into a single vector that resembles neither.
  it('matches on the best enrolled angle, not the first', () => {
    const turned = normalise(alice.map((x, i) => x + (i % 3 === 0 ? 0.25 : 0)));
    const many = {
      userId: 'alice',
      displayName: 'alice',
      embeddings: [bob, turned],
      model: MODEL,
    };

    const m = bestMatch(turned, MODEL, [many]);
    expect(m.profile.userId).toBe('alice');
    expect(m.similarity).toBeCloseTo(1);
  });

  it('ignores a row whose angles are all somebody else', () => {
    const many = {
      userId: 'bob',
      displayName: 'bob',
      embeddings: [bob, vec(3)],
      model: MODEL,
    };
    expect(bestMatch(alice, MODEL, [many])).toBeNull();
  });

  it('honours a threshold passed in', () => {
    expect(bestMatch(alice, MODEL, [profile('bob', bob)], -1)).not.toBeNull();
  });
});

describe('poseUsable', () => {
  it('accepts a roughly frontal face', () => {
    expect(poseUsable(0, 0)).toBe(true);
    expect(poseUsable(MAX_YAW, MAX_PITCH)).toBe(true);
  });

  // Past this angle ArcFace does not fail loudly - the embedding just lands
  // somewhere arbitrary, which is how a stranger gets matched to a user.
  it('rejects a face turned too far', () => {
    expect(poseUsable(MAX_YAW + 0.01, 0)).toBe(false);
    expect(poseUsable(0, MAX_PITCH + 0.01)).toBe(false);
    expect(poseUsable(-1.2, 0)).toBe(false);
  });

  it('rejects angles the model could not produce', () => {
    expect(poseUsable(NaN, 0)).toBe(false);
    expect(poseUsable(0, Infinity)).toBe(false);
  });
});
