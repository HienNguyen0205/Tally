import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ARCFACE_API_URL, ARCFACE_TOKEN } from '@env';

/**
 * The embedding server: one POST per call, up to eight faces at a time.
 *
 * This used to be a WebSocket with binary framing, a heartbeat and a queue
 * keyed by request id - all of it there to avoid paying a TLS handshake per
 * face. The server moved to REST (CLIENT_MIGRATION.md), and the batch is what
 * replaces the saving: eight faces in one body run as a single forward pass,
 * which is cheaper than eight round trips ever were on one connection.
 *
 * Everything the old client existed for went with it - HTTP correlates request
 * and response by itself, so there is no id to match, nothing to reconnect,
 * and no idle timeout to keep alive.
 */

/** One face crop, ready to send. */
export interface Face {
  /** JPEG (or PNG) as base64. A `data:` prefix is accepted and stripped by
   *  the server, so SkImage.encodeToBase64's bare payload is fine as it is. */
  image: string;
  /**
   * The five alignment landmarks, in the pixel space of `image` ITSELF - not
   * of the camera frame it was cut from.
   *
   * The single easiest thing to get wrong here, and it fails silently: frame
   * coordinates on a crop still produce a perfectly ordinary-looking 512
   * numbers that describe nobody. `fivePoints` in meshLandmarks.ts does the
   * subtraction, and its test pins it.
   *
   * Order: left eye, right eye, nose, left mouth corner, right mouth corner.
   */
  kps: [number, number][];
}

export interface EmbedResult {
  /**
   * Which model produced these vectors, e.g. 'w600k_r50'.
   *
   * Stored alongside every enrolment and checked before every comparison. Two
   * models' embeddings are not differently scaled, they are unrelated - and
   * cosine between them still returns a plausible number drawn from nothing.
   * Taking the name from the response rather than a constant in this app is
   * the difference between noticing a backend model change and silently
   * matching strangers after one.
   */
  model: string;
  /** Length of each vector - 512 for the current model. */
  dim: number;
  /** Server-side milliseconds, for the record. */
  ms: number;
  /** L2-normalised already, in the same order as the faces sent. */
  vecs: number[][];
  /** Laplacian variance per image: how sharp the aligned face was. See
   *  SHARP_ENROL_MIN in faceEmbed.ts. */
  sharp: number[];
}

/**
 * A failed embedding call, with the status attached.
 *
 * Everything that can go wrong arrives here, which is the point: callers get
 * one error type and one number to branch on rather than having to tell an
 * AxiosError from a TypeError from a string. `status` is 0 when the request
 * never reached the server at all - no network, DNS, a refused connection -
 * and `timedOut` separates the one failure that is worth waiting out.
 */
export class EmbedError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly timedOut = false,
  ) {
    super(`[embed] ${status || 'network'}: ${detail}`);
    this.name = 'EmbedError';
  }

  /** 401, 413, 422 - a wrong token, an oversized image, a malformed body.
   *  None of these get better by trying again, and none are the user's doing. */
  get isConfiguration(): boolean {
    return this.status === 401 || this.status === 413 || this.status === 422;
  }

  /** The server looked at the image and refused it: blurred, undecodable, or
   *  the landmarks were not five points. Answered by taking the shot again. */
  get isBadImage(): boolean {
    return this.status === 400;
  }

  /** Nothing came back, or a gateway said the instance is not up. Waiting is
   *  the only remedy, which is what makes it the one worth retrying. */
  get isUnreachable(): boolean {
    return (
      this.timedOut ||
      this.status === 0 ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}

/**
 * How long one request may take.
 *
 * Ninety seconds, which is absurd for something a user is watching and is
 * nevertheless right: the server sleeps when idle and a cold start takes
 * 60-90s to answer the first call. A shorter timeout would not make that
 * faster, it would just guarantee the first call after a quiet spell always
 * fails. Warm calls come back in a few hundred milliseconds and never go near
 * this.
 */
export const EMBED_TIMEOUT_MS = 90_000;

/** The server's own ceiling on one batch. */
export const MAX_FACES = 8;

/** How long to wait before the one retry, when a call is allowed one. Short:
 *  the wait that matters is the request's own timeout, this is only there so
 *  a refused connection is not hammered the instant it fails. */
const RETRY_DELAY_MS = 1_500;

/** False when no server is configured, which is a normal state: the app then
 *  reports every face as unrecognised rather than pretending to try. */
export function embedConfigured(): boolean {
  return ARCFACE_API_URL != null && ARCFACE_API_URL !== '';
}

/**
 * The one HTTP client, built once.
 *
 * Built lazily rather than at module load because `ARCFACE_API_URL` may be
 * empty - axios does not mind an empty baseURL, but building a client for a
 * server that was never configured invites someone to use it. `embedFaces`
 * checks `embedConfigured` first and this is only ever reached after that.
 */
let client: AxiosInstance | null = null;

function api(): AxiosInstance {
  if (client != null) return client;
  client = axios.create({
    // No path here: the base is the host, each call names its own endpoint.
    // Trailing slash tolerated, because that is the one configuration typo
    // that would otherwise produce a 404 looking exactly like a dead server.
    baseURL: ARCFACE_API_URL.replace(/\/+$/, ''),
    timeout: EMBED_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Only 2xx is success. Everything else goes down the error path, where it
    // becomes an EmbedError with its status intact - rather than a "successful"
    // response whose body the caller then has to inspect for a mistake.
    validateStatus: status => status >= 200 && status < 300,
    // Makes a timeout throw ETIMEDOUT instead of the generic ECONNABORTED that
    // an aborted request also uses. Without it there is no way to tell "the
    // server took too long" from "we cancelled", and they deserve different
    // messages.
    transitional: { clarifyTimeoutError: true },
  });

  // The token goes on every request from one place. An interceptor rather than
  // a static header so it is read at call time: a build that later loads the
  // token from storage instead of the bundle changes here and nowhere else.
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    config.headers.set('Authorization', `Bearer ${ARCFACE_TOKEN}`);
    return config;
  });

  // Every failure leaves axios as an EmbedError, so nothing downstream has to
  // know axios exists.
  client.interceptors.response.use(
    response => response,
    (error: unknown) => Promise.reject(toEmbedError(error)),
  );

  return client;
}

/** Flattens whatever axios threw into this module's one error type. */
function toEmbedError(error: unknown): EmbedError {
  if (error instanceof EmbedError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const timedOut =
      axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED';

    const response = axiosError.response;
    if (response == null) {
      // No response at all: offline, DNS, refused, or the timeout above.
      return new EmbedError(0, axiosError.message, timedOut);
    }
    return new EmbedError(
      response.status,
      // FastAPI puts the useful part in `detail`, including which image of a
      // batch was rejected. Falling back to the status text rather than
      // axios's own message, which only repeats the status code.
      response.data?.detail ?? axiosError.response?.statusText ?? 'error',
      timedOut,
    );
  }

  return new EmbedError(
    0,
    error instanceof Error ? error.message : String(error),
  );
}

export interface EmbedOptions {
  /**
   * Allow one retry when the server cannot be reached.
   *
   * Off by default, and that default is deliberate. A live scan that retries
   * has already spent 90 seconds on a face that left the frame a minute ago -
   * the right move there is to give up and let the next face try. Enrolment is
   * the opposite: the user pressed a button and is waiting on purpose, and the
   * first call after a quiet spell is exactly the one that wakes a sleeping
   * instance, so the retry is what turns "it failed" into "it took a while".
   */
  retry?: boolean;
  /** Called when the first attempt failed and a retry is starting, so the UI
   *  can say the server is waking up rather than leaving a spinner unexplained. */
  onRetry?: () => void;
  /** Cancels the request - pass an AbortController's signal. */
  signal?: AbortSignal;
}

/**
 * Embeds one to eight faces in a single call.
 *
 * Rejects rather than resolving to null: every failure - no server, no
 * network, a refused image - collapses to the same outcome for the caller, and
 * `readFace` already has one branch for it.
 *
 * One bad image fails the whole batch, with its index in `detail` (for example
 * `image #2 is too blurry`). That is the server's design and it is the right
 * one for enrolment, where a batch is several angles of one person and a
 * blurred angle would poison the set.
 */
export async function embedFaces(
  faces: Face[],
  options: EmbedOptions = {},
): Promise<EmbedResult> {
  if (!embedConfigured()) {
    throw new EmbedError(0, 'no ARCFACE_API_URL configured');
  }
  if (faces.length === 0 || faces.length > MAX_FACES) {
    // Caught here rather than sent: the server would answer 422, and that is a
    // programming error dressed up as a network round trip.
    throw new EmbedError(
      422,
      `${faces.length} faces, expected 1..${MAX_FACES}`,
    );
  }

  try {
    const { data } = await api().post<EmbedResult>(
      '/embed',
      { faces },
      { signal: options.signal },
    );
    return data;
  } catch (e) {
    const error = toEmbedError(e);
    // Retried only for the failures waiting actually fixes. A 400 retried is
    // the same blurred image sent twice; a 401 retried is the same wrong token.
    if (!options.retry || !error.isUnreachable) throw error;

    options.onRetry?.();
    await new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    const { data } = await api().post<EmbedResult>(
      '/embed',
      { faces },
      { signal: options.signal },
    );
    return data;
  }
}
