/**
 * Comparing face embeddings.
 *
 * ArcFace maps a face crop to 512 numbers whose *direction* carries the
 * identity - the magnitude does not. So every comparison here is cosine
 * similarity between L2-normalised vectors, which for unit vectors is just the
 * dot product.
 *
 * All of this is deliberately free of Skia, TFLite and Supabase so it can be
 * tested without a device - the matching threshold is the single number that
 * decides whether the app confuses two people, and it deserves to be pinned.
 */

/** How long an ArcFace embedding is. Wrong length means the wrong model. */
export const EMBEDDING_SIZE = 512;

/**
 * Which model this build EXPECTS the server to be running.
 *
 * Two models' embeddings are not merely differently scaled - they live in
 * unrelated 512-dimensional spaces. Cosine between them still returns a
 * perfectly reasonable-looking number, drawn from nothing. If that number
 * happens to clear MATCH_THRESHOLD, the app puts one person's name on another
 * person's face, and nothing anywhere reports an error.
 *
 * The length check in fetchProfiles catches only the case where the other
 * model had a different output size. Same size, different training - the
 * likeliest way to get here - sails straight through it. Hence a stored name
 * rather than an inferred one.
 *
 * Change this string whenever the recognition model changes, INCLUDING a
 * change of preprocessing (input range, alignment) severe enough to move the
 * embeddings. Every profile enrolled under the old name then stops matching,
 * which is the correct outcome: those people re-enrol.
 *
 * An expectation, and no longer the authority. Every embedding now arrives
 * from the server with the model's name attached, that name is stored with the
 * enrolment, and `bestMatch` compares the two - so a backend that switches
 * model stops matching instead of matching wrongly, without this constant
 * having to be right. That is the whole point: the server's answer is a fact,
 * a constant in the app is a belief, and beliefs go stale silently.
 *
 * What it is still used for is the enrolment prompt - deciding whether the
 * signed-in user has a face this build can use - because that question is
 * asked before any embedding exists to read a name off.
 *
 * It reads 'w600k_r50' because the server runs InsightFace's buffalo_l. Rows
 * enrolled by the old on-device tflite model are labelled 'arcface-tflite-v1'
 * and can never match anything produced today.
 */
export const ACTIVE_MODEL = 'w600k_r50';

/**
 * Cosine similarity above which two embeddings are called the same person.
 *
 * 0.36 is the usual operating point for ArcFace on 512-d embeddings: same
 * person typically lands 0.5-0.9, different people cluster near 0 and rarely
 * pass 0.3. Raising it makes the app refuse to recognise people it should;
 * lowering it makes it claim strangers are enrolled users, which is the far
 * worse failure here - so this errs high.
 */
export const MATCH_THRESHOLD = 0.36;

/**
 * Scales a vector to unit length.
 *
 * Returns null for a zero (or non-finite) vector rather than dividing by zero
 * and producing NaNs that would silently compare as "not a match" everywhere.
 * A zero embedding means the model ran on something it could not read.
 */
export function normalise(v: readonly number[]): number[] | null {
  let sum = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) return null;
    sum += x * x;
  }
  if (sum <= 0) return null;

  const inv = 1 / Math.sqrt(sum);
  return v.map(x => x * inv);
}

/**
 * Cosine similarity of two embeddings, in -1..1.
 *
 * Both are assumed already normalised - `normalise` runs once when an
 * embedding is created, not on every comparison, since a scan compares one
 * face against every enrolled profile.
 */
export function similarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

export interface FaceProfile {
  userId: string;
  /** What to show when this profile is recognised. */
  displayName: string;
  /**
   * Every angle enrolled for this person, each already L2-normalised.
   *
   * Several rather than one because enrolment sends a batch: a face looked at
   * straight on, turned a little left, turned a little right. Kept as a list
   * and scored by best match rather than averaged - the mean of three
   * directions in a 512-dimensional space points somewhere none of them do,
   * and it is exactly the off-angle shot that the mean throws away that a
   * real scan needs.
   */
  embeddings: number[][];
  /** The model that produced them, as the server named it when this face was
   *  enrolled. Compared, never assumed. */
  model: string;
}

export interface Match {
  profile: FaceProfile;
  similarity: number;
}

/**
 * The best profile for one face, or null if nothing clears the threshold.
 *
 * Returns the single best rather than every profile over the line: a face is
 * one person, and showing a ranked list of "maybe these three" would be a way
 * of admitting the threshold is not doing its job.
 *
 * `model` is the model that produced `embedding`, and profiles enrolled under
 * any other one are skipped outright rather than scored. Not an optimisation:
 * a cosine between two unrelated 512-d spaces is a plausible number computed
 * from nothing, and when one of those numbers happens to clear the threshold
 * the app puts a name on the wrong face and reports no error at all.
 */
export function bestMatch(
  embedding: readonly number[],
  model: string,
  profiles: readonly FaceProfile[],
  threshold: number = MATCH_THRESHOLD,
): Match | null {
  let best: Match | null = null;

  for (const profile of profiles) {
    if (profile.model !== model) continue;

    // The best of this person's angles, not the first: one enrolled angle
    // matching well IS this person, and demanding that all of them do would
    // mean the straight-on shot vetoes the turned one every time.
    for (const enrolled of profile.embeddings) {
      const score = similarity(embedding, enrolled);
      if (score < threshold) continue;
      if (best == null || score > best.similarity) {
        best = { profile, similarity: score };
      }
    }
  }
  return best;
}

/**
 * Whether a face is turned far enough away that ArcFace should not be trusted
 * on it.
 *
 * ArcFace degrades sharply on profile views - it was trained on roughly
 * frontal crops - and a low-confidence embedding does not fail loudly, it just
 * lands somewhere random in the 512-d space, which is exactly how a stranger
 * gets matched to an enrolled user. FaceMesh gives yaw and pitch for free
 * (see FACE_POSE in faceEmbed.ts), so a face too far off-axis is reported as
 * "cannot tell" instead of being guessed at.
 *
 * Angles are radians as the model emits them.
 */
export const MAX_YAW = 0.6; // ~34 degrees
export const MAX_PITCH = 0.5; // ~29 degrees

export function poseUsable(yaw: number, pitch: number): boolean {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
  return Math.abs(yaw) <= MAX_YAW && Math.abs(pitch) <= MAX_PITCH;
}
