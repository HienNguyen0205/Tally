import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useCameraPermission, type Frame } from 'react-native-vision-camera';
import {
  SkiaCamera,
  type SkiaOnFrameState,
} from 'react-native-vision-camera-skia';
import type { SkImage } from '@shopify/react-native-skia';
import {
  useTensorflowModel,
  type TensorflowModelDelegate,
} from 'react-native-fast-tflite';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MODEL_SIZE, NMS_IOU } from '../shared/constants';
import { boxToScreen, toFrameBox } from '../shared/boxLayout';
import {
  mergeDetections,
  passesThreshold,
  type Detection,
} from '../shared/detections';
import {
  EMPTY_TRACKS,
  livingTracks,
  trackFaces,
  type TrackState,
} from '../shared/tracker';
import { COLORS, FONT } from '../shared/theme';
import { summarise } from '../shared/history';
import { t } from '../i18n';
import { makePreview, makeThumbnail } from '../shared/thumbnail';
import { useAlert } from '../hooks/useAlert';
import { useCameraControls } from '../hooks/useCameraControls';
import { useScanHistory } from '../hooks/useScanHistory';
import { useFaceIdentity } from '../hooks/useFaceIdentity';
import { embedConfigured } from '../detection/embedClient';
import type { useSettings } from '../hooks/useSettings';
import { ResultIsland } from '../components/ResultIsland';
import { GlassSurface } from '../components/GlassSurface';
import { CtaButton } from '../components/CtaButton';
import { FocusRing } from '../components/FocusRing';
import { IconButton } from '../components/IconButton';
import { LaunchScreen } from '../components/LaunchScreen';
import { useDialog } from '../components/Dialog';
import { DetectionBox } from '../components/DetectionBox';
import { HistorySheet } from '../components/HistorySheet';
import { SettingsScreen } from './SettingsScreen';
import { EnrolFaceScreen } from './EnrolFaceScreen';
import { FaceScanScreen } from './FaceScanScreen';
import { readFrameDetections } from '../detection/runModel';

/**
 * The shortest rest between two detection runs, in milliseconds.
 *
 * A floor, not the whole rule: the real rest is whichever is longer, this or
 * however long the LAST pass took (see the frame processor). Detection and
 * rendering share one thread, so a pass that starts again the instant it
 * finishes leaves the preview almost nothing - which is what a stuttering
 * viewfinder actually is.
 *
 * Measured on the test device (Tecno LI6, GPU delegate, 320 input): a pass
 * costs **64-92ms**, so at this floor the thread spends about 28% of its time
 * detecting and delivers 22-26 of the 30 frames a second it is asked for, with
 * detection landing 3-4 times a second. The floor is what governs there - the
 * adaptive half only takes over on a slower device or the CPU fallback, which
 * is exactly what it is for.
 *
 * Lowering this buys tracking and spends preview: at 120ms detection reaches
 * ~5/s and the preview drops to about 19fps. Raising it does the reverse.
 * There is no third option short of moving inference off this thread.
 */
const DETECT_FLOOR_MS = 200;

/**
 * How long the count must hold still before the scan is written to history.
 *
 * There is no shutter any more, so this is what "a scan" means now: point the
 * camera, let the number settle, and the moment it stops moving is the moment
 * worth keeping.
 */
const STABLE_MS = 2000;

/** Familiar zoom steps; any step beyond the device's range is dropped. */
const ZOOM_STEPS = [1, 2, 3, 5];

/** Height of the header pill, for placing the result island under it. */
const HEADER_H = 44;

// GPU delegate: measured on a real device (Tecno LI6) - the detector delegates
// 411/411 nodes and FaceMesh 99/99.
//
// The CPU fallback below only catches LOAD failures, not runtime ones.
// 'android-gpu' exists on Android only; elsewhere it throws at load time, so
// don't bother trying.
const TRY_GPU = true;
const PREFERRED_DELEGATES: TensorflowModelDelegate[] =
  TRY_GPU && Platform.OS === 'android' ? ['android-gpu'] : [];
const CPU_ONLY: TensorflowModelDelegate[] = [];

// Matches the model's input tensor exactly: [1, 3, 640, 640] float32.
// 'planar' because the shape is NCHW (channels first), 'float32' because the
// resizer emits 0..1 - the scale YOLO wants.
/**
 * 30, not 15. Detection does not run any more often for it - that is gated
 * separately - but every frame BETWEEN detections is a frame the preview can
 * show, and at 15 there were not enough of them for the motion to look
 * continuous.
 *
 * A module constant rather than a literal in the JSX: the same array every
 * render, so nothing downstream has to work out that it did not change.
 */
const CAMERA_CONSTRAINTS = [{ fps: 30 }];

const RESIZER_FORMAT = {
  width: MODEL_SIZE,
  height: MODEL_SIZE,
  channelOrder: 'rgb',
  dataType: 'float32',
  pixelLayout: 'planar',
} as const;

/**
 * History, lens and Settings in one floating pill.
 *
 * Its own memoised component purely for the cost of NOT redrawing it. The
 * screen re-renders on every detection round - several times a second - and
 * this subtree is three Reanimated buttons inside a GlassSurface, whose core
 * is a real Android BlurView. Blurring the same pixels three times a second
 * to produce an identical result is the kind of work that does not show up in
 * any one profile line and shows up in every frame.
 *
 * The callbacks it takes must be stable, or the memo is decoration.
 */
const HeaderPill = React.memo(function HeaderPillInner({
  top,
  onHistory,
  onFlip,
  onSettings,
}: {
  top: number;
  onHistory: () => void;
  onFlip: () => void;
  onSettings: () => void;
}) {
  return (
    <GlassSurface
      pill
      style={[styles.header, { top }]}
      contentStyle={styles.headerRow}
    >
      <IconButton name="clock" label={t('openHistory')} onPress={onHistory} />
      <IconButton name="flip" label={t('flipCamera')} onPress={onFlip} />
      <IconButton
        name="settings"
        label={t('openSettings')}
        onPress={onSettings}
      />
    </GlassSurface>
  );
});

/** Status screen (permission, loading, error) - a two-layer floating card. */
function StateScreen({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { width, height } = useWindowDimensions();
  // Landscape is much shorter - keeping the portrait vertical padding overflows.
  const landscape = width > height;

  return (
    <View style={[styles.center, landscape && styles.centerLandscape]}>
      <GlassSurface style={styles.stateShell} contentStyle={styles.stateCore}>
        <Text style={styles.stateEyebrow}>{eyebrow}</Text>
        <Text style={styles.stateTitle}>{title}</Text>
        {body != null && <Text style={styles.stateBody}>{body}</Text>}

        {action != null && (
          <CtaButton
            style={styles.cta}
            label={action.label}
            onPress={action.onPress}
          />
        )}
      </GlassSurface>
    </View>
  );
}

interface Props {
  settings: ReturnType<typeof useSettings>;
  /** No signed-in session - history recording is disabled, see useScanHistory. */
  guest: boolean;
  /** Drops guest mode, handing control back to App.tsx's Root - which falls
   *  back to AuthScreen the moment there is still no real session. */
  onLeaveGuest: () => void;
  /** Signed in but with no face on file yet - show the enrolment overlay. */
  needsEnrolment: boolean;
  /** Puts the enrolment overlay back up - Settings offers this so a face can
   *  be re-scanned without reinstalling or waiting for a fresh sign-in. */
  onReEnrol: () => void;
  onEnrolmentSettled: () => void;
}

/**
 * The camera screen: a live viewfinder that counts faces continuously.
 *
 * There is no shutter. Detection runs on the camera thread as fast as the
 * model allows, boxes follow the faces between runs (shared/tracker), and a
 * scan writes itself to history once the count holds still. What used to be a
 * capture app - freeze, review, save, retake - is a viewfinder now, and the
 * modes, the review bar, the photo picker and the torch went with it.
 *
 * What this screen draws is deliberately thin: the camera, a box per face, a
 * count. The 468-point wireframe that used to sit over every face went to the
 * scan preview (FaceScanScreen), where it is drawn once on a frozen frame
 * instead of composited over a live one - a full-screen Skia canvas redrawn on
 * every state change is not a detail on a viewfinder, it is the budget.
 *
 * Detection and rendering share the camera thread, so the frame processor
 * rests for as long as the last pass cost (see DETECT_FLOOR_MS) rather than
 * running flat out. The shutter used to run a second, zoomed pass to catch
 * small faces; at that price it would put the count a full second behind the
 * scene it describes, so only the whole-frame pass survives.
 */
export function DetectorScreen({
  settings,
  guest,
  onLeaveGuest,
  needsEnrolment,
  onReEnrol,
  onEnrolmentSettled,
}: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const insets = useSafeAreaInsets();

  const { width: winW, height: winH } = useWindowDimensions();

  const [tracked, setTracked] = useState<TrackState>(EMPTY_TRACKS);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  /**
   * The face whose scan preview is open - its id, and the box as it was when
   * it was tapped.
   *
   * The box is copied rather than looked up each render because the preview is
   * frozen: the person carries on moving, their track eventually dies, and the
   * scan on screen still has to be the one they asked for.
   */
  const [picked, setPicked] = useState<{ id: number; box: Detection } | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cam = useCameraControls();
  const onAlert = useAlert(settings.hapticsEnabled);
  const { dialog } = useDialog();

  // The threshold lives in Settings now. It used to have a slider on the
  // review toolbar, which was the right place while a frozen frame could be
  // re-filtered without shooting again - there is no frozen frame any more,
  // and one control in one place beats the same control in two.
  const threshold = settings.defaultThreshold;

  // Enrolment is a selfie. Swing round to the front lens as the overlay opens
  // rather than making the first thing a new account does be hunting for the
  // flip button. Not swung back afterwards on purpose: the lens you finished
  // on is the lens you asked for.
  const { selectLens } = cam;
  useEffect(() => {
    if (needsEnrolment) selectLens('front');
  }, [needsEnrolment, selectLens]);

  const visible = useMemo(() => livingTracks(tracked), [tracked]);
  const faceCount = visible.length;

  const {
    records: history,
    add: addHistory,
    removeMany: removeScans,
    addPreview,
    loadPreview,
    older: olderHistory,
    loadOlder,
    loadingOlder,
    canLoadOlder,
  } = useScanHistory(guest);

  /** Writes one settled scene to history. */
  const recordScan = useCallback(
    (kept: Detection[], source: SkImage | null) => {
      const at = Date.now();
      const id = `${at}-${Math.random().toString(36).slice(2, 8)}`;

      addHistory({
        id,
        at,
        // A record without its picture is still worth keeping.
        thumbnail: (source != null ? makeThumbnail(source) : null) ?? '',
        ...summarise(kept),
      });

      // The bigger copy for reopening the scan, written to its own key so the
      // history list stays small. Encoding it costs a few milliseconds and the
      // write is not awaited - by now the image is already on screen.
      const preview = source != null ? makePreview(source) : null;
      if (preview != null) addPreview(id, preview);
    },
    [addHistory, addPreview],
  );

  // --- Loading the models ---
  // Try GPU first, fall back to CPU if that fails.
  //
  // Derived from constants on every render rather than held in state: a
  // useState initialiser only runs at mount, and Fast Refresh preserves state -
  // editing PREFERRED_DELEGATES would do nothing until a full restart.
  const [gpuFailed, setGpuFailed] = useState(false);
  const delegates: TensorflowModelDelegate[] = gpuFailed
    ? CPU_ONLY
    : PREFERRED_DELEGATES;
  const objectDetection = useTensorflowModel(
    require('../../assets/models/widerfaceyolo26.tflite'),
    delegates,
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  // Recognition. Only needed once a face has been found, so a failure to load
  // costs the identity line and nothing else - unlike the detector, which the
  // whole screen waits on.
  //
  // ArcFace is not here any more: it runs on a server now (see
  // docs/arcface-server.md), which is what took 22MB and a CPU-only Vision
  // Transformer out of this app.
  const meshModel = useTensorflowModel(
    require('../../assets/models/mediapipe_face-tflite-float/face_landmark_detector.tflite'),
    delegates,
  );
  const mesh = meshModel.state === 'loaded' ? meshModel.model : undefined;

  const cameraRef = cam.camera;
  const takeSnapshot = useCallback(() => {
    // Never throws. The camera's frame texture is disposed between frames and
    // whenever the session restarts, and both callers here ask for a snapshot
    // from outside the frame callback - the history timer two seconds after
    // the count settled, and the identity pump partway through an async read.
    // Landing in that gap is normal, not exceptional; it threw an uncaught
    // "Attempted to access a disposed object" and took the screen down with
    // it. Every caller already handles null: the scan is recorded without a
    // thumbnail, the face reads as unreadable.
    try {
      return cameraRef.current?.takeSnapshot() ?? null;
    } catch (e) {
      console.warn('[DetectorScreen] no snapshot available', e);
      return null;
    }
  }, [cameraRef]);

  /**
   * Whether putting names to faces is switched on at all.
   *
   * Read once: it is an environment variable, so it cannot change while the
   * app runs. With no server configured every face still went through the
   * whole read - a snapshot, an offscreen Skia render, a 110,000-element
   * float loop, a FaceMesh inference, a JPEG encode - before failing at a
   * network call that was never going to happen. That is the single most
   * expensive thing this screen can do, done entirely for nothing.
   */
  const recognising = useMemo(() => embedConfigured(), []);

  const { identities, reset: resetIdentity } = useFaceIdentity(
    mesh,
    // Every track, not just the visible ones: a face blinking out for a round
    // is still the same person, and the hook needs to know that to avoid
    // reading them again.
    tracked.tracks,
    takeSnapshot,
    // Guests have no session, so fetchProfiles would come back empty and every
    // face would read as unknown - say nothing rather than say "not enrolled"
    // about people who may well be.
    !guest && recognising,
  );

  // TFLite does NOT fall back to CPU on its own: a device that cannot build the
  // GPU delegate fails the load outright and stays failed. Without this catch
  // the app is dead on exactly those devices - which still install it.
  useEffect(() => {
    if (objectDetection.state === 'error' && !gpuFailed) {
      console.warn(
        '[DetectorScreen] GPU delegate unavailable, falling back to CPU',
        objectDetection.error,
      );
      setGpuFailed(true);
    }
  }, [objectDetection, gpuFailed]);

  // One pass, over the whole frame. The shutter used to run a second, zoomed
  // pass to catch small faces; at ~440ms each that would put the count a
  // second behind the scene it describes.
  const { resizer, error: resizerError } = useResizer({
    ...RESIZER_FORMAT,
    scaleMode: 'contain',
  });

  // Shared with the worklet: when the last detection started.
  const lastDetect = useMemo(() => createSynchronizable<number>(0), []);
  /**
   * 1 while a detection result is on its way to the JS thread and has not been
   * taken yet.
   *
   * Back-pressure, and it is not optional. The camera thread and the JS thread
   * run independently: JS can be busy for a while (a FaceMesh run, a snapshot,
   * a render with a few thousand mesh points in it) while the camera thread
   * happily keeps detecting and calling scheduleOnRN. Those calls queue. When
   * JS finally comes up for air it processes the whole backlog in one go, each
   * entry setting state twice, and React ends the burst with "maximum update
   * depth exceeded" - which is exactly what happened.
   *
   * With this, a frame is only detected if the last result has been consumed.
   * Dropping a detection costs nothing: the next frame is along in
   * milliseconds, and a result nobody has read yet is already stale.
   */
  const pending = useMemo(() => createSynchronizable<number>(0), []);
  /** How long the last detection pass took, in milliseconds. Measured rather
   *  than assumed: it changes with the model, the delegate and the device. */
  const lastCost = useMemo(() => createSynchronizable<number>(0), []);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // --- The worklet reports back to the JS thread ---
  const onDetected = useCallback(
    (found: Detection[], frameW: number, frameH: number) => {
      try {
        // NMS still has to run, even though there is only one pass now.
        // `parseDetections` hands back every anchor over the floor, and one face
        // lights up a whole cluster of neighbouring anchors - the capture path
        // merged them and this one did not, so a single face arrived as eight
        // overlapping boxes, eight tracks, eight identity reads, and a count of
        // eight.
        const kept = mergeDetections(
          [
            found
              .filter(d => passesThreshold(d, threshold))
              .map(d => ({
                ...d,
                ...toFrameBox(d, 'contain', frameW, frameH),
              })),
          ],
          NMS_IOU,
        );

        // Same numbers, same object: the frame size only ever changes when
        // the device rotates, but a fresh object every round is a fresh
        // render every round, for nothing. React bails out on an unchanged
        // reference.
        setFrameSize(prev =>
          prev != null && prev.w === frameW && prev.h === frameH
            ? prev
            : { w: frameW, h: frameH },
        );
        setTracked(prev => trackFaces(prev, kept));
      } finally {
        // Taken. The camera thread may detect again - and this has to happen
        // even if the work above threw, or one bad round stops detection for
        // the rest of the session with nothing on screen to say why.
        pending.setBlocking(0);
      }
    },
    [threshold, pending],
  );

  // Writes a scan once the count settles.
  //
  // Keyed on the count alone, which is what makes this a debounce rather than
  // a timer: any change to the number tears the effect down and starts the two
  // seconds again, and a number that never changes never fires twice. Hold the
  // camera on the same three people all afternoon and it records once.
  //
  // Everything it needs at that moment comes through a ref, so the boxes being
  // redrawn - which happens on every detection round - cannot restart the
  // clock. Only the count may do that.
  const latest = useRef({ visible, takeSnapshot, recordScan, onAlert });
  latest.current = { visible, takeSnapshot, recordScan, onAlert };
  useEffect(() => {
    if (faceCount === 0) return;
    const timer = setTimeout(() => {
      const now = latest.current;
      now.recordScan(
        now.visible.map(track => track.box),
        now.takeSnapshot(),
      );
      now.onAlert();
    }, STABLE_MS);
    return () => clearTimeout(timer);
  }, [faceCount]);

  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  /**
   * The frame processor, held stable across renders.
   *
   * This was an arrow written inline in the JSX, which made it a NEW function
   * on every render - and this screen re-renders several times a second, once
   * per detection round. A changed function prop on a Fabric view is a props
   * update sent across to native, so the camera was being handed a fresh frame
   * processor to install two or three times a second while it was trying to
   * deliver thirty frames in that same second.
   *
   * Now it is rebuilt only when something it actually closes over changes: the
   * models, the resizer, and the callback that carries the threshold.
   */
  const onFrame = useCallback(
    (
      frame: Frame,
      render: (draw: (state: SkiaOnFrameState) => void) => void,
    ) => {
      'worklet';

      // Detect BEFORE rendering, never after.
      //
      // This was the other way round for a while, to get each frame on screen
      // without waiting half a second for the model. It cost the detector its
      // input: render() consumes the frame texture, so the resize that
      // followed handed the model an empty buffer and it returned, quite
      // correctly, nothing at all. A face in front of the lens read as zero -
      // no error, no warning, just a camera that had stopped seeing.
      //
      // Frames that are not being detected still render immediately, which is
      // most of them: only the detection frame pays the wait.

      // Rest for at least as long as the last pass cost, so rendering gets
      // about half this thread no matter what the model costs.
      const rest = Math.max(DETECT_FLOOR_MS, lastCost.getDirty());
      const detect =
        model != null &&
        resizer != null &&
        // Nothing already queued for the JS thread. Without this the two
        // threads decouple: JS blocks on a face read while the camera thread
        // keeps detecting and queueing, and the backlog lands in one burst
        // that React ends with "maximum update depth exceeded". A dropped
        // detection costs nothing - the next frame is milliseconds away and an
        // unread result is stale already.
        pending.getDirty() === 0 &&
        // Date.now, not performance.now: both exist on the worklet runtime,
        // and only this one is in the type surface here.
        Date.now() - lastDetect.getDirty() >= rest;

      if (detect) {
        pending.setBlocking(1);
        const started = Date.now();
        const found = readFrameDetections(model!, resizer!, frame);
        // Both stamps taken at the END: what the next round has to wait out is
        // the gap in which this thread is free to render, not the gap between
        // two start times.
        const finished = Date.now();
        lastCost.setBlocking(finished - started);
        lastDetect.setBlocking(finished);
        // Frame size goes along: JS needs it to map boxes into frame space.
        scheduleOnRN(onDetected, found, frame.width, frame.height);
      }

      render(({ frameTexture, canvas }) => {
        canvas.drawImage(frameTexture, 0, 0);
      });

      frame.dispose();
    },
    [model, resizer, onDetected, lastCost, lastDetect, pending],
  );

  const { setCameraReady } = cam;
  const onStarted = useCallback(() => setCameraReady(true), [setCameraReady]);
  const onStopped = useCallback(() => setCameraReady(false), [setCameraReady]);

  const onCameraError = useCallback((e: unknown) => {
    // CameraX cancels zoom commands while the session is restarting (flipping
    // the lens, Fast Refresh). Harmless: the next set lands. Swallow only this
    // one, everything else must stay visible.
    const msg = String(e);
    if (
      msg.includes('OperationCanceledException') ||
      msg.includes('Camera is not active')
    ) {
      return;
    }
    console.warn('[Camera]', e);
  }, []);

  const { focusAt } = cam;
  const onFocusTap = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      focusAt(locationX, locationY);
    },
    [focusAt],
  );

  const { camera, device, cameraReady, zoom } = cam;

  /**
   * The camera element itself, rebuilt only when the camera's own inputs change.
   *
   * Not a decoration. SkiaCamera does not hand the preview to a SurfaceView -
   * it copies each rendered frame to a CPU SkImage and pushes it to the JS
   * thread, where the new image is stored and the previous one disposed
   * (see updatePreviewTexture in the library). The preview is therefore a
   * canvas this tree redraws, and every re-render of this screen was another
   * chance to redraw it in the instant between those two operations. Measured:
   * one frame in forty came back completely black with the overlays still
   * drawn on top of it.
   *
   * Holding the element steady means a detection round updates the boxes and
   * leaves the preview alone.
   */
  const cameraView = useMemo(
    () =>
      device == null ? null : (
        <SkiaCamera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          pixelFormat="yuv"
          constraints={CAMERA_CONSTRAINTS}
          zoom={cameraReady ? zoom : undefined}
          onStarted={onStarted}
          onStopped={onStopped}
          onError={onCameraError}
          // Rotate the buffer upright BEFORE it reaches us. Without this the
          // frame keeps the sensor's orientation (landscape while the phone is
          // held upright) - the model sees people lying on their side, detects
          // poorly and the boxes land badly off.
          enablePhysicalBufferRotation={true}
          onFrame={onFrame}
        />
      ),
    [
      camera,
      device,
      cameraReady,
      zoom,
      onStarted,
      onStopped,
      onCameraError,
      onFrame,
    ],
  );

  if (device == null) {
    return <StateScreen eyebrow={t('deviceEyebrow')} title={t('noCamera')} />;
  }

  if (!hasPermission) {
    return (
      <StateScreen
        eyebrow={t('permissionEyebrow')}
        title={t('cameraPermissionTitle')}
        body={t('cameraPermissionBody')}
        action={{ label: t('grantPermission'), onPress: requestPermission }}
      />
    );
  }

  if (objectDetection.state === 'loading') {
    return <LaunchScreen status={t('loadingModel')} />;
  }

  if (objectDetection.state === 'error') {
    return (
      <StateScreen
        eyebrow={t('errorEyebrow')}
        title={t('modelLoadFailed')}
        body={String(objectDetection.error)}
      />
    );
  }

  if (resizerError != null) {
    return (
      <StateScreen
        eyebrow={t('errorEyebrow')}
        title={t('resizerFailed')}
        body={String(resizerError)}
      />
    );
  }

  // Enrolment borrows this screen's camera, so it also has to borrow the
  // screen: every control hides while it is up, and it draws its own.
  const enroling = needsEnrolment && model != null && mesh != null;
  const showTools = picked == null && !enroling;
  // Below the header pill, with a gap - same number for portrait and
  // landscape, since the header sits at the same top-right spot in both.
  const resultTop = insets.top + 12 + HEADER_H + 10;

  return (
    <View style={styles.container}>
      {cameraView}

      {/* Focus. Sits below every button so it cannot steal their taps. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={t('tapToFocus')}
        onPress={onFocusTap}
      />

      {cam.focusPoint != null && (
        <FocusRing
          key={`${cam.focusPoint.x},${cam.focusPoint.y}`}
          x={cam.focusPoint.x}
          y={cam.focusPoint.y}
        />
      )}

      {frameSize != null &&
        !enroling &&
        picked == null &&
        visible.map(track => (
          <DetectionBox
            key={track.id}
            detection={track.box}
            rect={boxToScreen(track.box, frameSize.w, frameSize.h, winW, winH)}
            identity={identities[track.id]}
            onPress={() => setPicked({ id: track.id, box: track.box })}
          />
        ))}

      {picked != null && (
        <FaceScanScreen
          mesh={mesh}
          box={picked.box}
          identity={identities[picked.id]}
          takeSnapshot={takeSnapshot}
          onClose={() => setPicked(null)}
        />
      )}

      {!enroling && <ResultIsland top={resultTop} faceCount={faceCount} />}

      {showTools && (
        <HeaderPill
          top={insets.top + 12}
          onHistory={openHistory}
          onFlip={cam.flip}
          onSettings={openSettings}
        />
      )}

      {historyOpen && (
        <HistorySheet
          records={history}
          onRemoveMany={removeScans}
          loadPreview={loadPreview}
          older={olderHistory}
          onLoadOlder={loadOlder}
          loadingOlder={loadingOlder}
          canLoadOlder={canLoadOlder}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsScreen
          settings={settings}
          historyCount={history.length}
          onClearHistory={() => removeScans(history.map(r => r.id))}
          guest={guest}
          onLeaveGuest={onLeaveGuest}
          onReEnrol={onReEnrol}
          zoom={cam.zoom}
          zoomSteps={ZOOM_STEPS.filter(z => z <= device.maxZoom)}
          onZoom={cam.setZoom}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Enrolment, over the live camera it borrows. Only while the detector
          and the mesh model are actually loaded - the overlay has no models of
          its own to fall back on. */}
      {enroling && (
        <EnrolFaceScreen
          detector={model}
          mesh={mesh}
          takeSnapshot={takeSnapshot}
          onFlip={cam.flip}
          onDone={() => {
            // The face just enrolled has to be read again, or everyone on
            // screen keeps the "not enrolled" answer from a second ago.
            resetIdentity();
            onEnrolmentSettled();
          }}
          onSkip={onEnrolmentSettled}
        />
      )}

      {/* Last, so it paints over the camera and its controls. */}
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // --- Status screen ---
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    paddingHorizontal: 28,
    paddingVertical: 96,
  },
  centerLandscape: { paddingVertical: 28 },
  stateShell: { width: '100%', maxWidth: 420 },
  stateCore: { paddingVertical: 32, paddingHorizontal: 26 },
  stateEyebrow: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 9,
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  stateTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 26,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  stateBody: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },

  // --- CTA --- (the pill itself lives in CtaButton; this is only its place
  // in the status card)
  cta: { alignSelf: 'flex-start', marginTop: 26 },

  // --- Header (History, lens, Settings) ---
  header: { position: 'absolute', right: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 1 },
});
