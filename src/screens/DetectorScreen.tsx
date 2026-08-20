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
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCameraPermission } from 'react-native-vision-camera';
import { SkiaCamera } from 'react-native-vision-camera-skia';
import {
  Canvas,
  Image as SkiaImage,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  useTensorflowModel,
  type TensorflowModelDelegate,
} from 'react-native-fast-tflite';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PERSON_CLASS_ID,
  MODEL_SIZE,
  NMS_IOU,
} from '../shared/constants';
import { boxToScreen, toFrameBox } from '../shared/boxLayout';
import {
  mergeDetections,
  passesThreshold,
  type Detection,
} from '../shared/detections';
import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { summarise, totalOf } from '../shared/history';
import { t } from '../i18n';
import { makePreview, makeThumbnail } from '../shared/thumbnail';
import { useAlert } from '../hooks/useAlert';
import { useSavePhoto } from '../hooks/useSavePhoto';
import { useCameraControls } from '../hooks/useCameraControls';
import { useClassFilter } from '../hooks/useClassFilter';
import { useRefinedLabel } from '../hooks/useRefinedLabel';
import { useScanHistory } from '../hooks/useScanHistory';
import type { useSettings } from '../hooks/useSettings';
import { ResultIsland } from '../components/ResultIsland';
import { ScanOverlay } from '../components/ScanOverlay';
import { GlassSurface } from '../components/GlassSurface';
import { CtaButton } from '../components/CtaButton';
import { FocusRing } from '../components/FocusRing';
import { IconButton } from '../components/IconButton';
import { ThresholdSlider } from '../components/ThresholdSlider';
import { ZoomSelector } from '../components/ZoomSelector';
import { ReviewBar } from '../components/ReviewBar';
import { LaunchScreen } from '../components/LaunchScreen';
import { DetailSheet } from '../components/DetailSheet';
import { useDialog } from '../components/Dialog';
import { DetectionBox } from '../components/DetectionBox';
import { ClassFilter } from '../components/ClassFilter';
import { HistorySheet } from '../components/HistorySheet';
import { PhotoPicker, loadImageData } from '../components/PhotoPicker';
import { SettingsScreen } from './SettingsScreen';
import { readFrameDetections } from '../detection/runModel';
import { scanImage } from '../detection/scanImage';
import { annotate } from '../detection/annotate';

// 'idle': preview, waiting for the shutter | 'capturing': scan exactly the next
// frame | 'frozen': camera off, holding the scanned image still
type Mode = 'idle' | 'capturing' | 'frozen';

// The scan animation lingers after the image freezes so the scan is visible.
const SCAN_ANIM_MS = 900;

const pressEase = Easing.bezier(...EASE_OUT_EXPO);

// Familiar zoom steps; any step beyond the device's range is dropped.
const ZOOM_STEPS = [1, 2, 3, 5];

// IconButton (40) plus the GlassSurface pill's own padding (BEZEL_PAD*2 + the
// hairline borders) - measured from the identical bottom toolRow pill, which
// wraps the same IconButtons. Used to keep ResultIsland clear of the header
// pill above it without either one measuring the other at runtime.
const HEADER_H = 54;

// GPU delegate: measured on a real device (Tecno LI6, both models float32),
// Invoke runs clean for detector and classifier alike - "boat" comes back with
// the same name as CPU (gondola), a few percent apart because floating-point
// accumulates in a different order, not because anything is wrong. It was
// switched off once while chasing an Invoke failure whose real culprit turned
// out to be the model file (offset buffers - see assets/models/README.md).
//
// Note the CPU fallback below only catches LOAD failures, not runtime ones.
// 'android-gpu' exists on Android only; elsewhere it throws at load time, so
// don't bother trying.
const TRY_GPU = true;
const PREFERRED_DELEGATES: TensorflowModelDelegate[] =
  TRY_GPU && Platform.OS === 'android' ? ['android-gpu'] : [];
const CPU_ONLY: TensorflowModelDelegate[] = [];

// Matches the model's input tensor exactly: [1, 3, 640, 640] float32.
// 'planar' because the shape is NCHW (channels first), 'float32' because the
// resizer emits 0..1 - the scale YOLO wants.
const RESIZER_FORMAT = {
  width: MODEL_SIZE,
  height: MODEL_SIZE,
  channelOrder: 'rgb',
  dataType: 'float32',
  pixelLayout: 'planar',
} as const;

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
}

export function DetectorScreen({ settings, guest, onLeaveGuest }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const insets = useSafeAreaInsets();

  const { width: winW, height: winH } = useWindowDimensions();
  const landscape = winW > winH;

  const [mode, setMode] = useState<Mode>('idle');
  const [scanning, setScanning] = useState(false);
  // Scanning a library photo takes real time, unlike the camera path which
  // already has its result by the time it reports back. This flag keeps the
  // animation up until the work finishes.
  const [scanBusy, setScanBusy] = useState(false);
  const [result, setResult] = useState<Detection[] | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [picked, setPicked] = useState<Detection | null>(null);
  // Non-null = reviewing a library photo rather than a freshly captured frame.
  const [photo, setPhoto] = useState<SkImage | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Progress through a multi-photo run; null for a single photo or the camera.
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(
    null,
  );
  // Ids the last batch produced, so its rows can be summarised in the sheet.
  const [lastBatch, setLastBatch] = useState<string[] | null>(null);
  // Ids collected while adding captures up; null when that mode is off. Counting
  // a place usually means several shots from several angles, and until now the
  // running total lived in the user's head.
  const [session, setSession] = useState<string[] | null>(null);
  // Boxes are drawn over the image, so changing the threshold re-filters
  // immediately - no need to shoot again. Seeded from Settings rather than the
  // constant directly: useSettings reads MMKV synchronously, so this initial
  // value is already the user's saved default, not a placeholder that then
  // jumps a frame later.
  const [threshold, setThreshold] = useState(settings.defaultThreshold);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cam = useCameraControls();
  const { hidden, visible, counts, toggle, reset: resetFilter } =
    useClassFilter(result, threshold);

  const { state: saveState, save, reset: resetSave } = useSavePhoto();
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

  // The result already written to history. Compared by identity: a new scan
  // always makes a new array, while moving the threshold or hiding a class does
  // not - so adjusting the view afterwards cannot log a second entry.
  const recorded = useRef<Detection[] | null>(null);

  /** Writes one finished scan to history and returns its id. */
  const recordScan = useCallback(
    (kept: Detection[], source: SkImage | null): string => {
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

      // An updater, not `session` read from the closure: this callback is held
      // by the scan effect and would otherwise need `session` in its deps,
      // re-running the scan pipeline on every tap of the toggle.
      setSession(prev => (prev == null ? null : [...prev, id]));
      return id;
    },
    [addHistory, addPreview],
  );

  // Derived from `history`, not accumulated in its own counters: a row deleted
  // in the history sheet has to drop out of the running total as well.
  const sessionTotal = useMemo(
    () =>
      session == null
        ? null
        : totalOf(history.filter(r => session.includes(r.id))),
    [session, history],
  );

  const press = useSharedValue(0);
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.05 * press.value }],
  }));

  const onAlert = useAlert(settings.hapticsEnabled);
  // `show` renamed at the call site: `useAlert` above is the haptic buzz, and
  // two things called alert in one component is one too many.
  const { show: showDialog, dialog } = useDialog();

  // A cell readable and writable from both the JS thread and the worklet thread:
  // the shutter (JS) writes here, the worklet reads it each frame to decide
  // whether this is the frame to scan.
  const scanCmd = useMemo(() => createSynchronizable<Mode>('idle'), []);
  useEffect(() => {
    scanCmd.setBlocking(mode);
  }, [mode, scanCmd]);

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
    require('../../assets/models/yolo26n.tflite'),
    delegates,
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  // The classifier is only used when a box is tapped, so a failure costs just
  // the refined name - don't let it block the whole app like the detector does.
  const classifier = useTensorflowModel(
    require('../../assets/models/yolo26n-cls.tflite'),
    delegates,
  );
  const clsModel =
    classifier.state === 'loaded' ? classifier.model : undefined;

  const { refined, refining } = useRefinedLabel({
    picked,
    result,
    clsModel,
    frameSize,
    photo,
    camera: cam.camera,
  });

  // The tensor shapes/types the runtime actually sees - check these against
  // assets/models/README.md whenever the model changes, because getting it
  // wrong raises no error at all.
  useEffect(() => {
    if (model == null) return;
    console.log('[model] inputs', JSON.stringify(model.inputs));
    console.log('[model] outputs', JSON.stringify(model.outputs));
    console.log('[model] delegates', JSON.stringify(model.delegates));
  }, [model]);

  // TFLite does NOT fall back to CPU on its own: a device that cannot build the
  // GPU delegate fails outright while creating the interpreter. Without this
  // catch the app is dead on exactly those devices - which still install it,
  // because the library declares required="false".
  useEffect(() => {
    if (objectDetection.state === 'error' && delegates.length > 0) {
      console.warn(
        '[DetectorScreen] GPU delegate unavailable, falling back to CPU',
        objectDetection.error,
      );
      setGpuFailed(true);
    }
  }, [objectDetection, delegates]);

  // --- Two passes, two ways of fitting the frame into the model's square ---
  // Squeezing a 16:9 portrait frame into a square leaves 44% of the input width
  // as black bars, shrinking objects to a few dozen pixels and losing them. So a
  // second 'cover' pass spends all 640px on the middle of the frame, and the two
  // are merged: the edges survive and small objects still register. It also
  // lifts the ceiling from 25 detections per pass to 50.
  const { resizer: wideResizer, error: wideError } = useResizer({
    ...RESIZER_FORMAT,
    scaleMode: 'contain',
  });
  const { resizer: tightResizer, error: tightError } = useResizer({
    ...RESIZER_FORMAT,
    scaleMode: 'cover',
  });
  const resizerError = wideError ?? tightError;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // --- The worklet reports back to the JS thread ---
  const onScanned = useCallback(
    (wide: Detection[], tight: Detection[], frameW: number, frameH: number) => {
      // Map into frame space BEFORE merging - comparing raw coordinates from two
      // different squares directly produces nonsense.
      const merged = mergeDetections(
        [
          wide.map(d => ({ ...d, ...toFrameBox(d, 'contain', frameW, frameH) })),
          tight.map(d => ({ ...d, ...toFrameBox(d, 'cover', frameW, frameH) })),
        ],
        NMS_IOU,
      );

      setResult(merged);
      setFrameSize({ w: frameW, h: frameH });
      setMode('frozen'); // stop the camera now, hold exactly the scanned frame

      const people = merged.filter(
        d => d.classId === PERSON_CLASS_ID && passesThreshold(d, threshold),
      ).length;
      if (people > 0) onAlert();
    },
    [onAlert, threshold],
  );

  /**
   * Scanning library photos: same model, same two passes, same merge as a shot.
   *
   * A batch runs one photo at a time, showing each as it goes, and writes its
   * own history entries. It cannot lean on the effect below, which deliberately
   * waits for the whole run to finish - by then the intermediate results are
   * gone. The last entry is suppressed there via `recorded` instead of being
   * written twice.
   */
  const onPickPhotos = useCallback(
    async (uris: string[]) => {
      setPickerOpen(false);
      if (model == null || uris.length === 0) return;

      setScanBusy(true);
      setResult(null);
      resetFilter();
      setPicked(null);
      resetSave();
      setMode('frozen');

      const ids: string[] = [];
      let people = 0;

      try {
        for (const [i, uri] of uris.entries()) {
          setBatch(uris.length > 1 ? { done: i, total: uris.length } : null);

          // Decode first, animation off: there is nothing to scan yet, and
          // laying the animation over the camera preview reads as scanning the
          // scene in front of you rather than the photo just chosen.
          const image = Skia.Image.MakeImageFromEncoded(
            await loadImageData(uri),
          );
          if (image == null) throw new Error('could not decode the image');

          setPhoto(image);
          setFrameSize({ w: image.width(), h: image.height() });
          setResult(null);
          setScanning(true);

          // Yield a frame so React paints the image first. Without this,
          // building the input (Skia plus a pixel loop) runs in the same tick
          // and the animation appears before the image does.
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => resolve()),
          );

          const found = await scanImage(model, image);
          if (found == null) {
            throw new Error('could not create the processing surface');
          }
          setResult(found);

          const kept = found.filter(d => passesThreshold(d, threshold));
          people += kept.filter(d => d.classId === PERSON_CLASS_ID).length;

          const id = recordScan(kept, image);
          ids.push(id);
          // The effect below would otherwise log this last result a second time.
          recorded.current = found;
        }

        if (people > 0) onAlert();
        // One photo stays on screen as before. A batch has nothing useful left
        // showing - only the last image - so hand over to the sheet that can
        // show every result at once.
        if (ids.length > 1) {
          setLastBatch(ids);
          setHistoryOpen(true);
        }
      } catch (e) {
        console.warn('[DetectorScreen] library photo scan failed', e);
        setPhoto(null);
        setMode('idle');
        // Say it out loud: tapping a photo and having nothing happen just reads
        // as a broken app.
        showDialog({ title: t('scanFailed'), message: String(e) });
      } finally {
        setBatch(null);
        setScanBusy(false);
        setScanning(false);
      }
    },
    [model, threshold, onAlert, resetSave, resetFilter, recordScan, showDialog],
  );

  // Let the scan animation run on a little so the feedback registers. Skipped
  // while real work is in flight - then the work itself sets the duration.
  useEffect(() => {
    if (!scanning || scanBusy) return;
    const timer = setTimeout(() => setScanning(false), SCAN_ANIM_MS);
    return () => clearTimeout(timer);
  }, [scanning, scanBusy]);

  // If the box whose details are open gets hidden, the sheet has to close with
  // it, or it points at something no longer on screen.
  useEffect(() => {
    if (picked == null) return;
    if (!passesThreshold(picked, threshold) || hidden.has(picked.classId)) {
      setPicked(null);
    }
  }, [picked, threshold, hidden]);

  // Logs a camera capture once it has settled. A batch writes its own entries
  // as it goes and marks `recorded`, so this only ever fires for the shutter.
  useEffect(() => {
    if (result == null || scanning || scanBusy) return;
    if (recorded.current === result) return;
    recorded.current = result;

    // Same source the save button uses: the library photo, or the frozen frame.
    recordScan(visible, photo ?? cam.camera.current?.takeSnapshot() ?? null);
  }, [result, scanning, scanBusy, photo, visible, recordScan, cam.camera]);

  const { camera, device } = cam;

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

  // An error while the GPU delegate is still in play is only an intermediate
  // step - the effect above is reloading on CPU. Don't flash an error screen and
  // snatch it back.
  if (
    objectDetection.state === 'loading' ||
    (objectDetection.state === 'error' && delegates.length > 0)
  ) {
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

  const peopleCount = visible.filter(
    d => d.classId === PERSON_CLASS_ID,
  ).length;

  const zoomSteps = ZOOM_STEPS.filter(z => z <= device.maxZoom);

  const reviewing = mode === 'frozen' && !scanning;
  // The toolbar exists in two shapes: camera buttons while composing, the
  // threshold while reviewing. An open detail sheet takes the space outright.
  const showTools = (mode === 'idle' || reviewing) && picked == null;
  // Below the header pill, with a gap - same number for portrait and
  // landscape, since the header now sits at the same top-right spot in both.
  const resultTop = insets.top + 12 + HEADER_H + 10;

  return (
    <View style={styles.container}>
      <SkiaCamera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={mode !== 'frozen'}
        pixelFormat="yuv"
        constraints={[{ fps: 15 }]}
        zoom={cam.cameraReady ? cam.zoom : undefined}
        torchMode={cam.cameraReady ? cam.torch : undefined}
        onStarted={() => cam.setCameraReady(true)}
        onStopped={() => cam.setCameraReady(false)}
        onError={e => {
          // CameraX cancels zoom/torch commands while the session is restarting
          // (flipping the lens, Fast Refresh). Harmless: the next set lands.
          // Swallow only this one, everything else must stay visible.
          const msg = String(e);
          if (
            msg.includes('OperationCanceledException') ||
            msg.includes('Camera is not active')
          ) {
            return;
          }
          console.warn('[Camera]', e);
        }}
        // Rotate the buffer upright BEFORE it reaches us. Without this the frame
        // keeps the sensor's orientation (landscape while the phone is held
        // upright) → the model sees people lying on their side, detects poorly
        // and the boxes land badly off.
        enablePhysicalBufferRotation={true}
        // Skipping the render after capture is deliberate, to freeze the image.
        warnIfRenderSkipped={false}
        onFrame={(frame, render) => {
          'worklet';

          const cmd = scanCmd.getDirty();

          // Capture is done: drop every frame after it (the camera is winding
          // down). Stop rendering too, so the canvas holds exactly the scanned
          // frame - otherwise the image shown is newer than the boxes drawn.
          if (cmd === 'frozen') {
            frame.dispose();
            return;
          }

          if (
            cmd === 'capturing' &&
            model != null &&
            wideResizer != null &&
            tightResizer != null
          ) {
            const wide = readFrameDetections(model, wideResizer, frame);
            const tight = readFrameDetections(model, tightResizer, frame);

            // Latch right here (rather than waiting a React state round trip) so
            // later frames cannot scan over the shot just taken.
            scanCmd.setBlocking('frozen');
            // Send the frame size along: JS needs it to map boxes into frame
            // space.
            scheduleOnRN(onScanned, wide, tight, frame.width, frame.height);
          }

          render(({ frameTexture, canvas }) => {
            canvas.drawImage(frameTexture, 0, 0);
          });

          frame.dispose();
        }}
      />

      {/* The library photo, over the frozen camera canvas. Drawn from the very
          SkImage handed to the model so EXIF cannot drift; fit="cover" matches
          boxToScreen. */}
      {photo != null && (
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={photo}
            x={0}
            y={0}
            width={winW}
            height={winH}
            fit="cover"
          />
        </Canvas>
      )}

      {/* Focus. Sits below every button so it cannot steal their taps. */}
      {mode === 'idle' && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('tapToFocus')}
          onPress={e => {
            const { locationX, locationY } = e.nativeEvent;
            cam.focusAt(locationX, locationY);
          }}
        />
      )}

      {cam.focusPoint != null && (
        <FocusRing
          key={`${cam.focusPoint.x},${cam.focusPoint.y}`}
          x={cam.focusPoint.x}
          y={cam.focusPoint.y}
        />
      )}

      {/* Tap outside a box to close the detail sheet. Sits below the boxes so
          tapping a different box still switches, rather than being swallowed. */}
      {picked != null && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('closeDetail')}
          onPress={() => setPicked(null)}
        />
      )}

      {reviewing &&
        frameSize != null &&
        visible.map((d, i) => (
          <DetectionBox
            key={i}
            detection={d}
            rect={boxToScreen(d, frameSize.w, frameSize.h, winW, winH)}
            selected={picked === d}
            onPress={() => setPicked(d)}
          />
        ))}

      {picked != null && (
        <View
          style={[
            styles.detailAnchor,
            landscape
              ? styles.detailAnchorLandscape
              : styles.detailAnchorPortrait,
          ]}
        >
          <DetailSheet
            classId={picked.classId}
            score={picked.score}
            refined={refined}
            refining={refining}
            onClose={() => setPicked(null)}
          />
        </View>
      )}

      {scanning && (
        <ScanOverlay
          label={
            batch != null
              ? t('scanningProgress', { done: batch.done + 1, total: batch.total })
              : undefined
          }
        />
      )}

      {(result != null || session != null) && (
        <ResultIsland
          top={resultTop}
          peopleCount={peopleCount}
          objectCount={visible.length}
          session={sessionTotal}
        />
      )}

      {/* History and Settings: utility actions, not camera adjustments, so
          they live in their own floating pill up top rather than crowding the
          bottom toolbar - which stays for controls used while framing a shot. */}
      {showTools && (
        <GlassSurface
          pill
          style={[styles.header, { top: insets.top + 12 }]}
          contentStyle={styles.headerRow}
        >
          <IconButton
            name="clock"
            label={t('openHistory')}
            onPress={() => setHistoryOpen(true)}
          />
          <IconButton
            name="settings"
            label={t('openSettings')}
            onPress={() => setSettingsOpen(true)}
          />
        </GlassSurface>
      )}

      {showTools && (
        <View
          style={[
            styles.tools,
            landscape ? styles.toolsLandscape : styles.toolsPortrait,
            reviewing && !landscape && styles.toolsReviewPortrait,
          ]}
        >
          {reviewing && (
            <ClassFilter counts={counts} hidden={hidden} onToggle={toggle} />
          )}

          {/* The two modes want different controls, and showing both at once
              stretched the pill across the whole screen. Capture gets the camera
              buttons; review gets the threshold, which is the only thing that
              does anything once an image is frozen. */}
          <GlassSurface pill contentStyle={styles.toolRow}>
            {mode === 'idle' ? (
              <>
                <IconButton
                  name="bolt"
                  label={cam.torch === 'on' ? t('torchOff') : t('torchOn')}
                  active={cam.torch === 'on'}
                  // The front camera has no torch, so lock it out rather than
                  // letting the tap do nothing.
                  disabled={cam.torchDisabled}
                  onPress={cam.toggleTorch}
                />
                <IconButton
                  name="image"
                  label={t('pickFromLibrary')}
                  onPress={() => setPickerOpen(true)}
                />
                <IconButton
                  name="sum"
                  label={session == null ? t('sumStart') : t('sumStop')}
                  active={session != null}
                  // Off then on starts a fresh total - there is no separate
                  // reset to find, and stopping is what you do when the count
                  // is finished anyway.
                  onPress={() => setSession(prev => (prev == null ? [] : null))}
                />
                <IconButton
                  name="flip"
                  label={t('flipCamera')}
                  onPress={cam.flip}
                />
              </>
            ) : (
              <ThresholdSlider value={threshold} onChange={setThreshold} />
            )}
          </GlassSurface>

          {mode === 'idle' && (
            <GlassSurface pill contentStyle={styles.zoomRow}>
              <ZoomSelector
                steps={zoomSteps}
                value={cam.zoom}
                onChange={cam.setZoom}
              />
            </GlassSurface>
          )}
        </View>
      )}

      <View
        style={[
          styles.controls,
          landscape ? styles.controlsLandscape : styles.controlsPortrait,
        ]}
      >
        {reviewing ? (
          <ReviewBar
            saveState={saveState}
            onRetake={() => {
              setResult(null);
              setPicked(null);
              setPhoto(null);
              resetFilter();
              resetSave();
              setMode('idle');
            }}
            onSave={() => {
              // A library photo saves itself; a shot comes off the canvas.
              const source = photo ?? camera.current?.takeSnapshot();
              // Burn only the boxes currently on screen into the pixels.
              save(
                source != null && frameSize != null
                  ? annotate(source, visible, frameSize.w, frameSize.h)
                  : undefined,
              );
            }}
          />
        ) : (
          <Animated.View style={shutterStyle}>
            <Pressable
              style={styles.shutterShell}
              disabled={scanning}
              accessibilityRole="button"
              accessibilityLabel={t('shutter')}
              onPressIn={() => {
                press.value = withTiming(1, {
                  duration: 180,
                  easing: pressEase,
                });
              }}
              onPressOut={() => {
                press.value = withTiming(0, {
                  duration: 420,
                  easing: pressEase,
                });
              }}
              onPress={() => {
                setScanning(true);
                setMode('capturing');
              }}
            >
              <View style={styles.shutterRing}>
                <View
                  style={[
                    styles.shutterCore,
                    scanning && styles.shutterCoreBusy,
                  ]}
                />
              </View>
            </Pressable>
          </Animated.View>
        )}
      </View>

      {pickerOpen && (
        <PhotoPicker
          onPick={onPickPhotos}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {historyOpen && (
        <HistorySheet
          records={history}
          batch={lastBatch}
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
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Last, so it paints over the camera and its controls. The Modals above
          are separate windows and would cover it regardless of order, but none
          of them is open when a scan runs - the picker closes itself before
          handing the photos over. */}
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

  // --- Header (History, Settings) --- top-right in both orientations: the
  // shutter already claims the bottom in portrait and the right edge in
  // landscape, so top-right is the one corner nothing else uses.
  header: { position: 'absolute', right: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 1 },

  // --- Camera toolbar ---
  tools: { position: 'absolute', alignItems: 'center', gap: 10 },
  // 54 (bottom) + 86 (shutter) + 16 ≈ 170 is the top of the shutter cluster, so
  // this has to sit well above it to keep the two groups apart.
  toolsPortrait: { bottom: 208, left: 0, right: 0 },
  // While reviewing, the shutter gives way to the much lower ReviewBar.
  toolsReviewPortrait: { bottom: 150 },
  // Landscape: pull towards centre-left, leaving the right edge to the shutter.
  toolsLandscape: { bottom: 24, left: 0, right: 160 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
  },
  zoomRow: { paddingHorizontal: 4, paddingVertical: 3 },

  // --- Detail sheet ---
  detailAnchor: { position: 'absolute', alignItems: 'center' },
  detailAnchorPortrait: { bottom: 190, left: 0, right: 0 },
  // Landscape: tuck left, leaving the right edge to the shutter.
  detailAnchorLandscape: { bottom: 20, left: 24 },

  // --- Shutter ---
  controls: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsPortrait: { bottom: 54, left: 0, right: 0 },
  // Landscape: shutter to the right edge, under the thumb in a two-hand grip.
  controlsLandscape: { right: 40, top: 0, bottom: 0 },
  shutterShell: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: COLORS.shell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.accent,
  },
  shutterCoreBusy: { backgroundColor: 'rgba(0,230,118,0.35)' },
});
