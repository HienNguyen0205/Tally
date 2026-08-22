import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { FACE_CROP_MARGIN, SEND_CROP_SIZE } from '../shared/constants';
import { normalise, poseUsable } from '../shared/faceMatch';
import type { Detection } from '../shared/detections';
import { renderToBase64 } from './modelInput';
import { readMesh } from './faceMesh';
import { fivePoints } from './meshLandmarks';
import { EmbedError, embedFaces, MAX_FACES, type Face } from './embedClient';

/**
 * How sharp an enrolment shot has to be before it is saved.
 *
 * The server rejects below 30, deliberately permissively - permissive is right
 * for a scan, where a soft frame costs one unnamed face and the next frame is
 * along in a moment. Enrolment is the opposite: a blurred angle produces a
 * vector that looks entirely normal and describes nobody, and it is then the
 * thing every future scan is compared against. That person simply never
 * matches again, with no error anywhere to say why.
 *
 * 45 is a starting point, not a measurement. CLIENT_MIGRATION.md §8 says to
 * log `sharp` from real devices for a few days and put this just below the
 * good-image cluster; until that is done it is a guess placed above the
 * server's floor rather than on it.
 */
export const SHARP_ENROL_MIN = 45;

export interface FaceReading {
  /** L2-normalised, ready for `similarity`. */
  embedding: number[];
  /** The model the SERVER used, e.g. 'w600k_r50'. Travels with the embedding
   *  everywhere it goes - stored on enrolment, checked before comparison. */
  model: string;
  /** Laplacian variance of the aligned face: how sharp this shot was, or null
   *  if the server did not report it. Null must not be read as "blurred" - the
   *  server has already applied its own floor, and treating a missing field as
   *  a failure would refuse every enrolment on a build that stopped sending
   *  it. */
  sharp: number | null;
  /** All 468 landmarks as x,y pairs in the image's 0..1 space - what the mask
   *  overlay draws. Kept on the reading rather than fetched again because the
   *  mesh run that produced the pose gate already had them. */
  points: Float32Array;
  pitch: number;
  yaw: number;
  roll: number;
}

/**
 * Why a face could not be turned into an embedding worth comparing.
 *
 * 'mesh' is FaceMesh saying the crop holds no face it can find. 'offline' is
 * the embedding server being unreachable, unconfigured or too slow - kept
 * apart from 'embedding' because it is the one failure here that says nothing
 * about the face, and telling someone their face is unreadable when the truth
 * is that the network is down sends them to fix the wrong thing.
 */
export type FaceReadingError =
  | 'render'
  | 'mesh'
  | 'pose'
  | 'offline'
  /** The server refused the image: blurred, broken, or the landmarks were not
   *  five points. All of them are answered by taking the shot again, so they
   *  share one reason rather than five messages nobody can act on differently. */
  | 'blurry'
  /** 401, 413 or 422 - a wrong token, an oversized image, a malformed body.
   *  None of these are the user's doing and none of them get better by trying
   *  again; they are separated so the message can say so. */
  | 'config'
  | 'embedding';

export type FaceReadingResult =
  | { ok: true; reading: FaceReading }
  | { ok: false; reason: FaceReadingError };

/**
 * The pixel region of `image` a detection covers, widened a little.
 *
 * The detector boxes the face tightly, while ArcFace was trained on crops that
 * include some forehead and chin. Handing it the bare box makes every
 * embedding sit slightly off the distribution the model knows - the same face
 * still matches itself, but the margin against strangers narrows, which is the
 * direction that costs correctness.
 *
 * Clamped to the image: a face at the edge of the frame would otherwise ask
 * Skia to read pixels that do not exist.
 *
 * Exported because the scan preview has to show the SAME pixels the models
 * were given. A preview that framed the face slightly differently would be a
 * picture of a scan rather than a picture of the scan.
 */
export function faceCropRect(d: Detection, w: number, h: number) {
  const cx = ((d.xmin + d.xmax) / 2) * w;
  const cy = ((d.ymin + d.ymax) / 2) * h;
  // Square, because both models take a square and a non-square source would be
  // squashed into it - distorting a face is exactly what a recogniser notices.
  const side =
    Math.max(d.xmax - d.xmin, d.ymax - d.ymin) *
    Math.max(w, h) *
    FACE_CROP_MARGIN;

  const left = Math.max(0, cx - side / 2);
  const top = Math.max(0, cy - side / 2);
  return {
    left,
    top,
    width: Math.min(side, w - left),
    height: Math.min(side, h - top),
  };
}

/**
 * Reads one detected face into an embedding, or explains why it could not.
 *
 * FaceMesh runs here on the phone; ArcFace runs on the server (see
 * docs/arcface-server.md). The order is deliberate and unchanged by the move:
 * the mesh answers where the face is and which way it is turned, and a face
 * turned too far never reaches the network at all. A profile view would
 * produce an embedding that is not merely weak but arbitrary, which is how a
 * stranger ends up matched to an enrolled user - and now it would also be a
 * pointless round trip.
 *
 * What goes over the wire is a base64 JPEG of the crop plus five landmarks.
 * The server does the alignment itself, fitting those five points onto
 * ArcFace's template, which is a better correction than the roll-levelling
 * this used to do here - and the reason renderToBase64 deliberately does not
 * rotate.
 *
 * One face per call here even though the endpoint takes eight. A scan reads
 * faces one at a time as the tracker finds them, so there is rarely a second
 * one ready to travel with the first; enrolment is where the batch pays, and
 * that is where it is used.
 */
export async function readFace(
  mesh: TensorflowModel,
  image: SkImage,
  detection: Detection,
): Promise<FaceReadingResult> {
  const w = image.width();
  const h = image.height();
  const src = faceCropRect(detection, w, h);

  // Both models take the crop scaled to fill their whole square - no
  // letterboxing here, unlike the detector, because the crop is already square
  // and black bars would be pixels the model reads as face.
  const read = await readMesh(mesh, image, src);
  if (read == null) return { ok: false, reason: 'render' };
  if (read.points.length === 0) return { ok: false, reason: 'mesh' };

  const { yaw, pitch, roll, points } = read;
  if (!poseUsable(yaw, pitch)) return { ok: false, reason: 'pose' };

  const jpeg = renderToBase64(image, src, SEND_CROP_SIZE);
  if (jpeg == null) return { ok: false, reason: 'render' };

  let result;
  try {
    result = await embedFaces([
      {
        image: jpeg,
        // In the CROP's pixels, not the frame's - fivePoints does that
        // subtraction, and getting it wrong returns a normal-looking vector
        // for nobody rather than an error.
        kps: fivePoints(points, src, w, h, SEND_CROP_SIZE),
      },
    ]);
  } catch (e) {
    return { ok: false, reason: embedFailure(e) };
  }

  const vec = result.vecs[0];
  if (vec == null || vec.length === 0) {
    console.warn('[faceEmbed] server returned no vector');
    return { ok: false, reason: 'embedding' };
  }

  // The server normalises already; doing it again is a few hundred
  // multiplications and means a server that forgets to cannot quietly break
  // every comparison in the app.
  const embedding = normalise(vec);
  if (embedding == null) return { ok: false, reason: 'embedding' };

  return {
    ok: true,
    reading: {
      embedding,
      model: result.model,
      sharp: result.sharp?.[0] ?? null,
      points,
      pitch,
      yaw,
      roll,
    },
  };
}

/**
 * Which failure a thrown embedding call was.
 *
 * The statuses are worth telling apart because the answers differ: 400 means
 * take the shot again, 401/413/422 mean this build is wrong and trying again
 * will fail identically, and everything else - no network, a cold server that
 * ran out the clock, DNS - means come back later.
 */
function embedFailure(e: unknown): FaceReadingError {
  if (!(e instanceof EmbedError)) {
    console.warn('[faceEmbed] unexpected embedding failure', e);
    return 'embedding';
  }

  if (e.isBadImage) {
    console.warn('[faceEmbed] server refused the image', e.detail);
    return 'blurry';
  }
  if (e.isConfiguration) {
    // Loud on purpose: none of these can be fixed from the user's side, and a
    // quiet "could not read this face" would send someone to stand in better
    // light over a wrong token.
    console.error('[faceEmbed] the embedding request itself is wrong', e);
    return 'config';
  }
  if (e.isUnreachable) {
    console.warn('[faceEmbed] embedding server unreachable', e.detail);
    return 'offline';
  }

  console.warn('[faceEmbed] embedding server error', e);
  return 'embedding';
}

/** One face crop prepared for the wire, plus the landmarks that made it. */
interface PreparedFace {
  face: Face;
  points: Float32Array;
  pitch: number;
  yaw: number;
  roll: number;
}

/**
 * Everything that happens to one face BEFORE the network: crop, mesh, pose
 * gate, encode.
 *
 * Split out because enrolment now sends several angles in one request, and the
 * alternative was this sequence written twice - which is how the crop used for
 * the landmarks drifts apart from the crop used for the image, leaving the
 * server five points that describe a slightly different square than the one it
 * is looking at.
 */
async function prepareFace(
  mesh: TensorflowModel,
  image: SkImage,
  detection: Detection,
): Promise<
  { ok: true; prepared: PreparedFace } | { ok: false; reason: FaceReadingError }
> {
  const w = image.width();
  const h = image.height();
  const src = faceCropRect(detection, w, h);

  const read = await readMesh(mesh, image, src);
  if (read == null) return { ok: false, reason: 'render' };
  if (read.points.length === 0) return { ok: false, reason: 'mesh' };

  const { yaw, pitch, roll, points } = read;
  if (!poseUsable(yaw, pitch)) return { ok: false, reason: 'pose' };

  const jpeg = renderToBase64(image, src, SEND_CROP_SIZE);
  if (jpeg == null) return { ok: false, reason: 'render' };

  return {
    ok: true,
    prepared: {
      // In the CROP's pixels, not the frame's - fivePoints does that
      // subtraction, and getting it wrong returns a normal-looking vector for
      // nobody rather than an error.
      face: { image: jpeg, kps: fivePoints(points, src, w, h, SEND_CROP_SIZE) },
      points,
      pitch,
      yaw,
      roll,
    },
  };
}

/** What a finished enrolment produces: several vectors of one person, and the
 *  name of the model that made all of them. */
export interface EnrolReading {
  model: string;
  /** One L2-normalised vector per angle, all from the same batch. */
  embeddings: number[][];
  /** Sharpness per angle, in the same order. */
  sharp: (number | null)[];
}

export type EnrolReadingResult =
  | { ok: true; reading: EnrolReading }
  | { ok: false; reason: FaceReadingError; index?: number };

/**
 * Reads several angles of ONE person in a single request.
 *
 * The whole batch is one forward pass on the server, so five angles cost about
 * what one does - which is the entire reason enrolment takes more than one
 * shot now. Several vectors of the same face, scored by best-match rather than
 * averaged, is what lets recognition survive a tilted head.
 *
 * All or nothing, by the server's design: one unusable image fails the batch.
 * That is right here. A batch is one person, and a blurred angle among four
 * good ones would become a vector nobody ever matches - permanently, silently.
 *
 * **Takes ownership of the images.** Every SkImage handed in is disposed here,
 * whether the batch succeeds or not. A snapshot is a full camera frame, and
 * holding several of them alive while a request is in flight is exactly the
 * kind of thing this app has already run out of memory over once. The caller
 * has no use for them afterwards - the pixels it cares about are in the JPEG.
 */
export async function readFaceBatch(
  mesh: TensorflowModel,
  shots: readonly { image: SkImage; detection: Detection }[],
  options: { onRetry?: () => void } = {},
): Promise<EnrolReadingResult> {
  if (shots.length === 0 || shots.length > MAX_FACES) {
    release(shots);
    return { ok: false, reason: 'embedding' };
  }

  const faces: Face[] = [];
  try {
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]!;
      const prepared = await prepareFace(mesh, shot.image, shot.detection);
      if (!prepared.ok) return { ok: false, reason: prepared.reason, index: i };
      faces.push(prepared.prepared.face);
    }
  } finally {
    // Before the network call, not after: by here every crop is already a
    // base64 string, and the request is the slow part to be holding frames
    // through.
    release(shots);
  }

  let result;
  try {
    // Retried once if the server is asleep. Enrolment is a button the user
    // pressed on purpose and is waiting on - unlike a live scan, where the
    // face has left the frame long before a second 90-second attempt ends.
    result = await embedFaces(faces, { retry: true, onRetry: options.onRetry });
  } catch (e) {
    return { ok: false, reason: embedFailure(e) };
  }

  const embeddings: number[][] = [];
  for (const vec of result.vecs ?? []) {
    const normalised = normalise(vec);
    if (normalised == null) return { ok: false, reason: 'embedding' };
    embeddings.push(normalised);
  }
  if (embeddings.length !== faces.length) {
    console.warn(
      `[faceEmbed] sent ${faces.length} faces, got ${embeddings.length} vectors`,
    );
    return { ok: false, reason: 'embedding' };
  }

  return {
    ok: true,
    reading: {
      model: result.model,
      embeddings,
      sharp: faces.map((_, i) => result.sharp?.[i] ?? null),
    },
  };
}

/** Frees a batch of snapshots. Disposing an image twice, or one the runtime
 *  has already collected, is not worth failing an enrolment over. */
function release(shots: readonly { image: SkImage }[]) {
  for (const shot of shots) {
    try {
      shot.image.dispose();
    } catch {
      // already gone
    }
  }
}
