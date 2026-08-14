# Tally — ObjectDetector

A React Native app that detects and counts objects in the camera frame. Press the
shutter and the app scans **exactly one frame** with YOLO26n running on TFLite
on-device, freezes that frame, and lays labelled bounding boxes over it so you can
inspect, re-filter and save the result.

It recognises all 80 COCO classes, with people highlighted in green and everything
else in amber. Everything runs on the device — no image ever leaves the phone.

> The bundled model is Ultralytics YOLO26n, licensed **AGPL-3.0**. Review the terms
> (or obtain a commercial licence) before shipping a closed-source build.

## Features

- **One-shot scanning on command**, not continuous inference: the worklet runs the
  model on exactly the next frame after the shutter is pressed, then switches to
  the `frozen` state and stops rendering so the frozen image stays pinned to the
  detections that came from it.
- **YOLO26n (COCO, 80 classes)** — `[1, 3, 640, 640]` float32 NCHW input, raw
  `[1, 84, 8400]` head with no NMS in the graph. People are stroked green, other
  objects amber.
- **Two-pass detection.** Each scan runs the model twice on the same frame: once
  letterboxed (`scaleMode: 'contain'`, full field of view) and once centre-cropped
  (`'cover'`, which spends all 640px on the middle of the frame instead of 44% of
  it on black bars). The two passes are mapped into frame space and merged with
  greedy NMS — so edge objects survive and small central objects get found. The
  model exports with `end2end: false`, meaning no NMS in the graph, so that same
  merge step is what turns 8400 raw anchors per pass into final detections —
  and what keeps the threshold slider meaningful, since nothing is discarded
  before the app sees it.
- **Live threshold on the captured photo.** Boxes are React Native views layered
  over the frozen image rather than baked into it, so dragging the threshold
  re-filters the photo you are already looking at — no re-capture. Boxes are only
  burned into pixels at save time, via an offscreen Skia surface.
- **Native buffer rotation** (`enablePhysicalBufferRotation`) so the model always
  receives an upright image instead of one rotated 90° to match the sensor.
- **Filter by class**, collapsed by default to a single summary pill and expanded
  on tap. The chips list the classes actually present with their counts — not all
  90 COCO labels, since the other 85 have nothing to do with the photo on screen.
  Toggling a chip hides those boxes and drops them from the count, like the
  threshold, without re-running anything.
- **Scan an existing photo.** Pick an image from the device library and it goes
  through the same model, the same two passes and the same merge as a live capture.
  The resizer only accepts camera `Frame`s, so this path builds the model input
  with Skia instead — see [src/detection/scanImage.ts](src/detection/scanImage.ts).
- **Tap any box for details**: Vietnamese class label, confidence and area ratio —
  plus a finer name from a second model. COCO only knows 80 coarse classes, so a
  tapped crop goes through YOLO26n-cls (1000 ImageNet classes) and the sheet shows
  what it found: a boat becomes "gondola". It runs on tap only, never during a
  scan, and stays silent when it isn't confident.
- Camera controls: torch, front/back flip, 1×/2×/3×/5× zoom steps (steps beyond
  `device.maxZoom` are dropped automatically), tap-to-focus, and a confidence
  threshold slider (default `0.6`).
- Haptic alert when people are detected, and saving the annotated image to the
  device photo library.
- Adaptive portrait/landscape layout for every control cluster.

## Requirements

- Node.js `>= 22.11.0`
- React Native 0.86.2 (bare workflow — no Expo)
- **Android**: `minSdkVersion 26`, `compileSdk`/`targetSdk 36`
- **iOS**: React Native's `min_ios_version_supported`, plus CocoaPods via Bundler
- A physical device with a camera — this pipeline does not run on simulators

## Installation

```bash
npm install
```

`postinstall` runs `patch-package` automatically to apply the
[`react-native-fast-tflite` patch](patches/react-native-fast-tflite+3.0.1.patch):
in release builds the `.tflite` asset is bundled into the APK, so
`Image.resolveAssetSource()` returns a **resource name** rather than a URL,
making `URL(path)` throw `MalformedURLException` and the model fail to load. The
patch resolves it as a raw/drawable resource first.

iOS needs the Pods step as well:

```bash
bundle install
```

```bash
bundle exec pod install
```

## Running

Start Metro:

```bash
npm start
```

Then build and run from another terminal window:

```bash
npm run android
```

```bash
npm run ios
```

## Permissions

| Permission | Platform | Why it's needed |
|---|---|---|
| `CAMERA` / `NSCameraUsageDescription` | Android, iOS | Frame source for scanning |
| `VIBRATE` | Android | Haptic alert when people are detected |
| `READ_MEDIA_IMAGES` (API 33+) / `READ_EXTERNAL_STORAGE` (≤ 32) / `NSPhotoLibraryUsageDescription` | Android, iOS | Listing library photos so one can be picked and scanned |
| `WRITE_EXTERNAL_STORAGE` | Android ≤ 28 | Saving the annotated image; from API 29 MediaStore handles it, so it is only requested on older devices |
| `INTERNET` | Android | Metro dev server in debug builds |

## How it works

A scan's lifecycle fits in three states: `idle` (preview) → `capturing` (scan the
next frame) → `frozen` (camera off, image held).

The shutter runs on the JS thread while scanning happens in a worklet, so the
command travels through a shared cell from `react-native-worklets`:

```ts
// src/screens/DetectorScreen.tsx
const scanCmd = useMemo(() => createSynchronizable<Mode>('idle'), []);

useEffect(() => {
  scanCmd.setBlocking(mode);
}, [mode, scanCmd]);
```

Inside `onFrame`, the worklet reads that command and runs both passes on the same
frame, then hands the raw detections to the JS thread:

```ts
onFrame={(frame, render) => {
  'worklet';
  const cmd = scanCmd.getDirty();
  if (cmd === 'frozen') { frame.dispose(); return; }

  if (cmd === 'capturing' && model != null &&
      wideResizer != null && tightResizer != null) {
    const wide = readDetections(model, wideResizer, frame);   // 'contain'
    const tight = readDetections(model, tightResizer, frame); // 'cover'

    scanCmd.setBlocking('frozen');
    scheduleOnRN(onScanned, wide, tight, frame.width, frame.height);
  }

  render(({ frameTexture, canvas }) => canvas.drawImage(frameTexture, 0, 0));
  frame.dispose();
}}
```

The worklet deliberately does no filtering or merging. Both of those need the two
passes expressed in one coordinate system, and the threshold has to stay editable
after the shutter — so they live on the JS side as plain, unit-tested functions:

```ts
// src/screens/DetectorScreen.tsx — inside onScanned
const merged = mergeDetections(
  [
    wide.map(d => ({ ...d, ...toFrameBox(d, 'contain', frameW, frameH) })),
    tight.map(d => ({ ...d, ...toFrameBox(d, 'cover', frameW, frameH) })),
  ],
  NMS_IOU,
);
```

Model coordinates live in the square the resizer produced, not in frame space, and
the two passes use different squares. Getting a box onto the screen is therefore
two conversions: model square → frame space (`toFrameBox`, the only place that
knows which pass a box came from), then frame space → screen pixels (`boxToScreen`,
which undoes the canvas's `fit="cover"`):

```ts
// src/shared/boxLayout.ts
const r = boxToScreen(detection, frameSize.w, frameSize.h, winW, winH);
// → { left, top, width, height } in screen pixels
```

The same `boxToScreen` runs again at save time against the snapshot's dimensions
instead of the screen's, which is what paints the boxes into the saved JPEG
([src/detection/annotate.ts](src/detection/annotate.ts)).

Scanning a library photo reaches the same place by a different route. There is no
`Frame` and therefore no resizer, so `scanImage.ts` draws the image into a 640×640
offscreen Skia surface itself and reads the pixels back. That hand-built placement
has to agree exactly with what `toFrameBox` assumes about the square, which is why
it lives in `boxLayout.ts` as `modelDestRect` next to its counterpart, with a test
asserting the two agree.

Model details, the specs verified on a real device, and what must be re-checked
when swapping models: [assets/models/README.md](assets/models/README.md).

## Testing

```bash
npm test
```

The suites cover the two places where a mistake produces no error at all, just
quietly wrong results:

- [`__tests__/letterbox.test.js`](__tests__/letterbox.test.js) — `toFrameBox()` for
  both scan spaces, including the case that makes merging possible: one object in
  the centre of the frame must land in the same place whether it came from the
  `'contain'` pass or the `'cover'` one; plus `modelDestRect()` agreeing with
  `toFrameBox()` across aspect ratios, which is what keeps the library-photo path
  aligned with the camera path
- [`__tests__/boxLayout.test.js`](__tests__/boxLayout.test.js) — `boxToScreen()`,
  plus one end-to-end pass through both conversions
- [`__tests__/detections.test.js`](__tests__/detections.test.js) — thresholds and
  NMS merging (same object deduped, single-pass objects kept, overlapping objects
  of different classes both kept)
- [`__tests__/parseDetections.test.js`](__tests__/parseDetections.test.js) — the
  raw YOLO head decode, above all the channel-major indexing (`c * 8400 + a`, not
  `a * 84 + c`): transpose those and boxes still appear, just in the wrong places.
  An end2end export hands back `[1, 300, 6]` instead — a completely different
  shape that fails silently

Linting:

```bash
npm run lint
```

## Project structure

```
ObjectDetector/
  App.tsx              # App root: SafeAreaProvider + translucent status bar
  index.js             # React Native entry point
  src/
    shared/            # Cross-cutting: used by both the detection pipeline and the UI
      boxLayout.ts     #   Coordinate mapping: model square → frame → screen
      constants.ts     #   MODEL_SIZE, PERSON_CLASS_ID, thresholds, NMS IoU
      detections.ts    #   Detection type, IoU, NMS merge
      labels.ts        #   The 80 COCO labels + Vietnamese translations
      theme.ts         #   Colours, fonts, radii, easing curves
    detection/         # The model pipeline, orchestrated only by DetectorScreen
      annotate.ts      #   Burn boxes into the photo at save time (offscreen Skia)
      classify.ts      #   Second-stage: crop a box, name it from 1000 ImageNet classes
      imagenetLabels.ts #  The 1000 ImageNet labels (generated from the model's metadata)
      modelInput.ts    #   Shared pixel-building for both TFLite models (NCHW)
      runModel.ts      #   Model output parsing, shared by the camera and photo paths
      scanImage.ts     #   Scan a library photo: Skia-built model input, both passes
    components/        # HUD: detection boxes, class filter, photo picker, glass surfaces, buttons, threshold slider, detail sheet
    hooks/             # useAlert (haptics), useSavePhoto (save to photo library)
    screens/           # DetectorScreen: camera, scan worklet, the whole HUD
  assets/
    fonts/             # Geist (SIL OFL), linked with react-native-asset
    models/            # yolo26n.tflite + notes on its verified tensor layout
  __tests__/           # Box coordinate tests
  patches/             # patch-package patch for react-native-fast-tflite
  android/             # Android project (bare workflow)
  ios/                 # iOS project + Podfile
```

## Engineering notes

- **The GPU delegate is on (`TRY_GPU = true` in `DetectorScreen.tsx`) and
  measured working.** It was disabled for a while during a `TFLite: Failed to
  run` investigation that turned out to be caused by the model file itself —
  offset-style buffers the bundled LiteRT runtime can't resolve, see
  [assets/models/README.md](assets/models/README.md) — not the delegate. Once
  both models were re-exported as clean float32 (rather than the quantized
  uint8 model this app started with, which GPU delegates handle poorly),
  Invoke ran clean on a real device (Tecno LI6) for both models: detections
  matched the CPU run exactly (person 87%, boat 64%), and the classifier
  named the same object ("gondola") within a few percent — the kind of drift
  expected from GPU floating-point accumulating in a different order than
  CPU, not a sign of anything wrong. The load-time fallback to CPU in
  `useEffect` still only catches failures at load, not at Invoke, so a
  different device could in principle still need it.
- **The Skia label font must be a family that really exists on the device.**
  `'System'`, `'Roboto'` and the empty string all return a Typeface that looks
  valid but has no glyphs — text measures to `width = 0` and draws invisibly. On
  Android only `'sans-serif'` works. This only applies to the save path in
  `annotate.ts`; on-screen labels are RN text in the bundled Geist family.
- **Zoom and torch may only be set after `onStarted`.** Setting them earlier makes
  CameraX throw `Camera is not active`; the `OperationCanceledException` raised
  while the camera session restarts is harmless and is swallowed deliberately.
- **A picked photo's URI is never a plain file**, on either platform: Android
  returns `content://media/…` and iOS returns `ph://<localIdentifier>`. React
  Native's `<Image>` resolves both, so the picker grid renders fine — but
  `Skia.Data.fromURI` handles neither, and on Android it **hangs without ever
  rejecting**, so the scan silently does nothing and no error is logged. Bytes
  therefore go through `loadImageData()`: `fetch` + `FileReader` for
  `content://`, and `CameraRoll.iosGetImageDataById(uri, { convertHeicImages:
  true })` for `ph://` (which also converts HEIC, the iPhone default, to JPEG).
- **Pixel layout depends on how the model was exported, not on which model it is.**
  Both bundled models were exported with Ultralytics 8.4.118, whose litert-torch
  path emits NCHW — their `serving_default_*` tensor names give that away, and it
  is why `renderToInput` can serve both. The ready-made downloads on the
  Ultralytics site come from the older ONNX→TF path and are NHWC instead. Feed a
  model the wrong layout and it still runs and still returns numbers, just
  meaningless ones.
- **ImageNet-1k contains no person class**, so classifying a person crop can only
  ever return a garment or a backdrop — measured on device: "sarong" at 6%. The
  refine step therefore skips `person` outright and drops anything under
  `MIN_REFINED_SCORE`; a wrong confident-looking name is worse than no name.
- **Never write a Reanimated shared value in a render body.** Strict mode warns
  about it, and the fix is always an effect keyed on the prop that drives the
  animation. Reading `.value` during render counts too.
- **The worklet applies only a hard floor** (`RAW_SCORE_FLOOR`), not the user's
  threshold. Everything above the floor is shipped to JS so the slider can reveal
  detections after the fact; the floor must stay below the slider's minimum
  (`0.2`).
- **One threshold for every class.** Lowering it for non-`person` classes was
  tried — they do score lower at equal detection quality — and removed: a slider
  reading 90% that still showed a 73% object made the number on screen a lie. The
  default is `0.5` rather than the `0.6` from when this only counted people, since
  `0.6` was tuned for `person` specifically.
- **Jest must transform the native packages.** The whole reanimated, worklets,
  skia, vision-camera, nitro, blur and camera-roll group ships ESM; see
  `transformIgnorePatterns` in [jest.config.js](jest.config.js) (note the pattern
  also accepts `\` for Windows paths).

## Key libraries

| Library | Role |
|---|---|
| [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera) | Camera, permissions, zoom, torch, focus |
| [`react-native-vision-camera-skia`](https://github.com/mrousavy/react-native-vision-camera) | `SkiaCamera` — frame rendering through Skia, `takeSnapshot()` |
| [`react-native-vision-camera-resizer`](https://github.com/mrousavy/react-native-vision-camera) | GPU-accelerated frame resize to the model's input size |
| [`react-native-fast-tflite`](https://github.com/mrousavy/react-native-fast-tflite) | Loading and running `.tflite` via `runSync` inside the worklet |
| [`react-native-worklets`](https://github.com/margelo/react-native-worklets) | `createSynchronizable`, `scheduleOnRN` — the JS ↔ worklet bridge |
| [`@shopify/react-native-skia`](https://github.com/Shopify/react-native-skia) | Drawing boxes and labels, encoding the image on save |
| [`react-native-nitro-image`](https://github.com/mrousavy/react-native-nitro-image) | Writing Skia image bytes out to a temporary file |
| [`@react-native-camera-roll/camera-roll`](https://github.com/react-native-cameraroll/react-native-cameraroll) | Saving the image to the photo library |
| [`react-native-reanimated`](https://github.com/software-mansion/react-native-reanimated) | HUD and shutter animations |
| [`@react-native-community/blur`](https://github.com/Kureev/react-native-blur) | Frosted-glass backgrounds for the HUD cards |
