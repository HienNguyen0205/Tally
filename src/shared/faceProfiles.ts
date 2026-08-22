import type { User } from '@supabase/supabase-js';

import { getUserId, supabase } from './supabase';
import { ACTIVE_MODEL, EMBEDDING_SIZE, type FaceProfile } from './faceMatch';

const TABLE = 'face_profiles';

/**
 * The enrolled faces, read and written through Supabase.
 *
 * The table and its row-level security live in supabase/face_profiles.sql,
 * which has to be run by hand once - read the warning at the top of it before
 * you do, because the policy that makes recognition work is also the one that
 * lets every account holder read every embedding.
 */

/**
 * Every enrolled profile, for a scan to compare against.
 *
 * Fetched whole and matched on the device rather than asking the database to
 * find the nearest vector: cosine similarity over a few hundred 512-number
 * rows is microseconds of arithmetic, and doing it here means no pgvector
 * extension, no RPC to keep in step with the client, and - the part that
 * actually matters - a scan that has already loaded the list keeps working
 * with no signal.
 *
 * Returns an empty list on any failure. A scan that cannot reach the network
 * should report every face as unrecognised, which is what an empty list
 * produces, rather than erroring out over a camera frame.
 */
export async function fetchProfiles(): Promise<FaceProfile[]> {
  // Every row, whatever model made it, with the model name carried along - the
  // filtering happens in bestMatch, against the model the SERVER just named
  // for this particular face.
  //
  // This used to filter here on ACTIVE_MODEL, which was filtering on a belief:
  // if the backend switched model and this constant had not been updated, the
  // query would faithfully return the rows that can no longer match and hide
  // the ones that can. Comparing two facts - what the server said now, what it
  // said at enrolment - has no such failure. The cost is a few hundred rows of
  // dead weight over the network on a list that is fetched once a minute.
  //
  // The `model` column is a hard requirement either way - see
  // supabase/face_profiles_model.sql. Without it the query errors and this
  // returns an empty list, so every face reads as unrecognised. That is the
  // safe direction to fail in: nobody named, rather than somebody named wrong.
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id, display_name, embeddings, model');
  if (error != null || data == null) {
    console.warn('[faceProfiles] could not read enrolled faces', error);
    return [];
  }

  const profiles: FaceProfile[] = [];
  for (const row of data) {
    // A vector of the wrong length was written by a different model. Comparing
    // across models produces confident nonsense, so drop it rather than let it
    // score against today's embeddings. Dropped per vector, not per row: a row
    // half-written by two builds is a bug worth surviving, and the angles that
    // are the right length are still that person.
    const usable = Array.isArray(row.embeddings)
      ? (row.embeddings as unknown[]).filter(
          (v): v is number[] => Array.isArray(v) && v.length === EMBEDDING_SIZE,
        )
      : [];
    if (usable.length === 0) {
      console.warn(
        '[faceProfiles] skipping a profile with no usable embedding',
      );
      continue;
    }
    profiles.push({
      userId: row.user_id,
      displayName: row.display_name,
      embeddings: usable,
      model: row.model,
    });
  }
  return profiles;
}

/**
 * What a scan calls this person when it recognises them.
 *
 * The name given at registration, falling back to the local part of the email
 * for accounts made before that field existed. Never the email itself: the
 * whole point of storing a name alongside the embedding is that recognising a
 * face must not hand a stranger somebody's address.
 */
function displayName(user: User): string {
  const given = user.user_metadata?.display_name;
  if (typeof given === 'string' && given.trim() !== '') return given.trim();
  return user.email?.split('@')[0] ?? 'Unknown';
}

/**
 * Saves the signed-in user's face, replacing whatever was enrolled before.
 *
 * An upsert rather than an insert: re-enrolling is the fix for "it stopped
 * recognising me", and that has to overwrite rather than fail or leave two
 * rows fighting over the same person.
 */
export async function enrolFace(
  /** Every angle captured in one batch, each already L2-normalised. */
  embeddings: readonly (readonly number[])[],
  /** What the server called the model that produced them. Written as given
   *  rather than as ACTIVE_MODEL: the row has to record what actually made it,
   *  or the guard in bestMatch is comparing a label to itself. */
  model: string,
): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (user == null) return false;

  if (
    embeddings.length === 0 ||
    embeddings.some(v => v.length !== EMBEDDING_SIZE)
  ) {
    console.warn('[faceProfiles] refusing to enrol wrong-sized embeddings');
    return false;
  }

  const { error } = await supabase.from(TABLE).upsert({
    user_id: user.id,
    embeddings: embeddings.map(v => [...v]),
    display_name: displayName(user),
    // Stamped on write rather than left to the column default, so a row always
    // says which model made it even if that default drifts later.
    model,
  });
  if (error != null) {
    console.warn('[faceProfiles] could not save the enrolled face', error);
    return false;
  }
  return true;
}

/**
 * Removes the signed-in user's enrolled face.
 *
 * Only ever their own row: the RLS delete policy is `auth.uid() = user_id`, so
 * the filter here matches what the database would enforce anyway. Deleting a
 * row that is not there is not an error - the caller wants the face gone, and
 * it is gone either way.
 */
export async function deleteEnrolment(): Promise<boolean> {
  const userId = await getUserId();
  if (userId == null) return false;

  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error != null) {
    console.warn('[faceProfiles] could not delete the enrolled face', error);
    return false;
  }
  return true;
}

/** Whether the signed-in user has a face on file - drives whether the app
 *  offers to enrol on the next launch. */
export async function hasEnrolled(): Promise<boolean> {
  const userId = await getUserId();
  if (userId == null) return false;

  // Enrolled under a DIFFERENT model does not count as enrolled: that row can
  // never match its owner, so the app should offer to scan again rather than
  // leave someone permanently unrecognised by a face they did enrol.
  const { data, error } = await supabase
    .from(TABLE)
    .select('user_id')
    .eq('user_id', userId)
    .eq('model', ACTIVE_MODEL)
    .maybeSingle();
  return error == null && data != null;
}
