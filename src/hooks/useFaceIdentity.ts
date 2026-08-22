import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { readFace, type FaceReadingError } from '../detection/faceEmbed';
import { bestMatch, type FaceProfile } from '../shared/faceMatch';
import { fetchProfiles } from '../shared/faceProfiles';
import type { Track } from '../shared/tracker';

export type Identity =
  /** Being read right now - one face at a time, see below. */
  | { state: 'reading' }
  /** Recognised: this face belongs to an enrolled account. */
  | { state: 'known'; displayName: string; similarity: number }
  /** Read cleanly, matched nobody. */
  | { state: 'unknown' }
  /** Could not be read well enough to say either way - see FaceReadingError. */
  | { state: 'unreadable'; reason: FaceReadingError };

/** How long the enrolled list is reused before being fetched again.
 *
 *  It used to be fetched once per scan, which was one query per shutter press.
 *  A live viewfinder has no shutter and would otherwise hit the network every
 *  time a new face appeared - so it is cached, and the cost of that is that
 *  someone who enrols on another device is recognised a minute late. */
const PROFILE_TTL_MS = 60_000;

/**
 * Puts a name to every face the tracker is following.
 *
 * Keyed by TRACK id, not by position in an array: that is the whole reason the
 * tracker exists. A face keeps its id while it stays in frame, so it is read
 * once - one FaceMesh run and one round trip to the embedding server - and
 * keeps its name while it moves, blinks or is briefly missed. Keying by index
 * would re-read every face on every detection round, several times a second.
 *
 * One face at a time. FaceMesh still runs on the JS thread, and firing several
 * at once would interleave them into one long block with nothing on screen
 * until the end. Each finished face lands immediately, then the next starts.
 *
 * The landmarks are used and dropped. They were kept in state while the
 * viewfinder drew a wireframe over every face; that mask is gone (it cost a
 * full-screen Skia canvas over a live camera, redrawn on every state change),
 * and holding 936 floats per face to draw nothing was pure weight.
 *
 * Takes EVERY track, not only the ones on screen: a face held through a
 * missed detection round must keep its name and its place in `claimed`, or
 * every blink costs another round trip to the server.
 *
 * The snapshot is taken here rather than passed in, because it has to be taken
 * as late as possible: boxes are up to one detection round old already, and a
 * frame captured any earlier would have drifted further from them. The crop's
 * margin absorbs what is left.
 */
export function useFaceIdentity(
  mesh: TensorflowModel | undefined,
  tracks: Track[],
  takeSnapshot: () => SkImage | null,
  enabled: boolean,
) {
  const [identities, setIdentities] = useState<Record<number, Identity>>({});

  const busy = useRef(false);
  /**
   * Ids already handed to a read, so the pump can decide what to do next
   * without looking at `identities`.
   *
   * It used to read `identities` and list it as a dependency - an effect that
   * writes the very state it depends on, which is the shape React's "maximum
   * update depth" error describes. It survived the obvious cases (the guard
   * held, the work converged) but there is no reason to keep an edge like that
   * in a loop that now runs several times a second: a ref carries the same
   * information and closes it outright.
   */
  const claimed = useRef(new Set<number>());
  const profiles = useRef<{ list: FaceProfile[]; at: number } | null>(null);
  const snapshotRef = useRef(takeSnapshot);
  snapshotRef.current = takeSnapshot;

  /** Bumped when a read finishes, purely to bring the pump back for the next
   *  face without waiting for the following detection round. A number that
   *  only moves once per completed read - unlike the map it replaced, which
   *  changed identity on every write. */
  const [finished, setFinished] = useState(0);

  const reset = useCallback(() => {
    profiles.current = null;
    claimed.current = new Set();
    setIdentities({});
  }, []);

  // Forget faces that have left. Without this the map grows for as long as the
  // camera is open - every passer-by, kept for the session.
  useEffect(() => {
    const alive = new Set(tracks.map(t => t.id));
    for (const id of claimed.current) {
      if (!alive.has(id)) claimed.current.delete(id);
    }

    setIdentities(prev => {
      const kept: Record<number, Identity> = {};
      let dropped = false;
      for (const [key, value] of Object.entries(prev)) {
        if (alive.has(Number(key))) kept[Number(key)] = value;
        else dropped = true;
      }
      // Same object when nothing left, so React bails out instead of
      // re-rendering the whole screen once per detection round for nothing.
      return dropped ? kept : prev;
    });
  }, [tracks]);

  // The pump: read one unidentified face, let it land, and the state change
  // brings this effect straight back for the next one.
  useEffect(() => {
    if (!enabled || mesh == null || busy.current) return;

    // `missed === 0` so a face is only read while it is actually on screen,
    // but `tracks` carries the ones being held through a missed round too -
    // that is what stops a blink from costing a second read.
    const next = tracks.find(t => t.missed === 0 && !claimed.current.has(t.id));
    if (next == null) return;

    claimed.current.add(next.id);
    busy.current = true;
    setIdentities(prev => ({ ...prev, [next.id]: { state: 'reading' } }));

    (async () => {
      let result: Identity;
      try {
        const now = Date.now();
        if (
          profiles.current == null ||
          now - profiles.current.at > PROFILE_TTL_MS
        ) {
          profiles.current = { list: await fetchProfiles(), at: now };
        }

        const shot = snapshotRef.current();
        if (shot == null) {
          result = { state: 'unreadable', reason: 'render' };
        } else {
          const read = await readFace(mesh, shot, next.box);
          if (!read.ok) {
            result = { state: 'unreadable', reason: read.reason };
          } else {
            const match = bestMatch(
              read.reading.embedding,
              // The model the server just named, not a constant here: a
              // profile enrolled under a different one is skipped rather
              // than scored against nonsense.
              read.reading.model,
              profiles.current.list,
            );
            result =
              match == null
                ? { state: 'unknown' }
                : {
                    state: 'known',
                    displayName: match.profile.displayName,
                    similarity: match.similarity,
                  };
          }
        }
      } catch (e) {
        console.warn('[useFaceIdentity] could not read a face', e);
        result = { state: 'unreadable', reason: 'embedding' };
      }

      setIdentities(prev => ({ ...prev, [next.id]: result }));
      busy.current = false;
      setFinished(n => n + 1);
    })();
  }, [enabled, mesh, tracks, finished]);

  return { identities, reset };
}
