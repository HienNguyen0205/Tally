import { iou } from './detections';
import type { Detection } from './detections';

/**
 * How much two boxes must overlap to be called the same face between two
 * detection rounds.
 *
 * Lower than the NMS threshold on purpose: NMS compares two boxes drawn on the
 * SAME frame, where a real duplicate overlaps heavily. These are boxes drawn
 * ~450ms apart, with a person who has moved in between, and demanding the same
 * agreement would hand the same face a new identity every time they leaned.
 */
export const TRACK_IOU = 0.25;

/**
 * How many detection rounds a face may go unmatched before it is forgotten.
 *
 * Two, not one: a single missed detection is routine - a blink, a turn, a
 * hand across the face - and dropping the track there would restart
 * recognition (a server round trip) for someone who never left the frame.
 */
export const TRACK_MAX_MISSED = 2;

export interface Track {
  /** Stable for as long as this face stays in frame. What recognition results
   *  are keyed by, so a name is fetched once rather than every round. */
  id: number;
  /** The most recent box, in frame space. */
  box: Detection;
  /** Detection rounds since this track was last matched. */
  missed: number;
}

export interface TrackState {
  tracks: Track[];
  /** The next id to hand out. Carried through rather than held in a module
   *  counter so this stays a pure function - two screens, or a test, cannot
   *  poison each other's numbering. */
  nextId: number;
}

export const EMPTY_TRACKS: TrackState = { tracks: [], nextId: 1 };

/**
 * Matches this round's detections against the faces already being followed.
 *
 * Greedy by overlap: every possible pairing is scored, the best is taken, and
 * both sides drop out - so one detection cannot claim two tracks, and the
 * strongest match wins rather than whichever happened to be first in the
 * array. Hungarian assignment would be optimal instead of greedy; with a
 * handful of faces on screen the two agree, and this is twenty lines.
 *
 * Unmatched tracks are kept for a round or two with their last known box,
 * which is also what keeps a box on screen while its face is briefly missed.
 * Unmatched detections become new tracks.
 */
export function trackFaces(
  state: TrackState,
  detections: Detection[],
): TrackState {
  const pairs: { t: number; d: number; overlap: number }[] = [];
  state.tracks.forEach((track, t) => {
    detections.forEach((detection, d) => {
      const overlap = iou(track.box, detection);
      if (overlap >= TRACK_IOU) pairs.push({ t, d, overlap });
    });
  });
  pairs.sort((a, b) => b.overlap - a.overlap);

  const takenTrack = new Set<number>();
  const takenDetection = new Set<number>();
  const next: Track[] = [];

  for (const pair of pairs) {
    if (takenTrack.has(pair.t) || takenDetection.has(pair.d)) continue;
    takenTrack.add(pair.t);
    takenDetection.add(pair.d);
    next.push({
      id: state.tracks[pair.t]!.id,
      box: detections[pair.d]!,
      missed: 0,
    });
  }

  // Faces that went unmatched this round: kept, ageing, holding their last box.
  state.tracks.forEach((track, t) => {
    if (takenTrack.has(t)) return;
    if (track.missed + 1 > TRACK_MAX_MISSED) return;
    next.push({ ...track, missed: track.missed + 1 });
  });

  let nextId = state.nextId;
  detections.forEach((detection, d) => {
    if (takenDetection.has(d)) return;
    next.push({ id: nextId++, box: detection, missed: 0 });
  });

  // Sorted by id so the render order is stable. Without it a face can swap
  // places in the array between rounds, and React's keys are the only reason
  // that does not show - better not to rely on it.
  next.sort((a, b) => a.id - b.id);

  // Nothing moved: hand back the SAME object, so React bails out instead of
  // re-rendering.
  //
  // This is not a micro-optimisation, it is the difference between an idle
  // screen being idle and an idle screen repainting several times a second.
  // Point the camera at an empty room and detection still runs 3-4 times a
  // second, still finds nothing, and still built a brand-new `{tracks: [],
  // nextId}` every time - which changed state, which re-rendered the whole
  // viewfinder, which redrew the camera preview's Skia canvas, for a number
  // that had not moved off zero.
  //
  // Reference equality on the box is deliberate. A track matched this round
  // carries a freshly built detection object, so it is correctly seen as
  // changed; the guard only fires when the round genuinely produced the same
  // list - in practice, an empty frame following an empty frame.
  const unchanged =
    nextId === state.nextId &&
    next.length === state.tracks.length &&
    next.every((track, i) => {
      const before = state.tracks[i]!;
      return (
        track.id === before.id &&
        track.missed === before.missed &&
        track.box === before.box
      );
    });

  return unchanged ? state : { tracks: next, nextId };
}

/**
 * The tracks currently worth drawing - everything matched recently enough to
 * still describe where a face is.
 *
 * One missed round is still drawn, at its last known box. This used to demand
 * `missed === 0`, which meant a single failed detection - a blink, a turn, one
 * blurred frame - blanked the box and the count for a couple of hundred
 * milliseconds and then brought them straight back. The face never went
 * anywhere; only the box did, and a box that flickers reads as a broken app.
 *
 * The cost is that a face which genuinely leaves keeps its box for one more
 * round. That is the better trade: leaving is rare and the box is right up to
 * the moment it goes, whereas a missed round happens all the time and the box
 * is wrong the whole time it is gone.
 */
export function livingTracks(state: TrackState): Track[] {
  return state.tracks.filter(t => t.missed < TRACK_MAX_MISSED);
}
