# Tally — ObjectDetector

A React Native app that detects and counts objects in the camera frame. Press the
shutter and the app scans **exactly one frame** with EfficientDet-Lite2 running on
TFLite on-device, draws labelled bounding boxes straight into the image, then
freezes that image so you can inspect and save it.

It recognises all 90 COCO classes, with people highlighted in green and everything
else in amber. Everything runs on the device — no image ever leaves the phone.

## Features

- **One-shot scanning on command**, not continuous inference: the worklet runs the
  model on exactly the next frame after the shutter is pressed, then switches to
  the `frozen` state and stops rendering so the displayed image matches the drawn
  boxes exactly.
- **EfficientDet-Lite2 (COCO 2017, 90 classes)** — `[1, 448, 448, 3]` uint8 input,
  up to 25 objects per scan. People are stroked green, other objects amber.
- **Letterbox preprocessing** (`scaleMode: 'contain'`) via
  `react-native-vision-camera-resizer`: the whole frame is preserved instead of
  cropping a centre square, so objects near the top and bottom edges are still
  detected.
- **Skia drawing inside the worklet** — boxes and labels are painted onto the
  frame texture itself, so `takeSnapshot()` saves exactly what you see.
- **Native buffer rotation** (`enablePhysicalBufferRotation`) so the model always
  receives an upright image instead of one rotated 90° to match the sensor.
- **Tap any box for details**: Vietnamese class label, confidence, area ratio and
  centre position within the frame.
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

Inside `onFrame`, the worklet reads that command, resizes the frame to a 448×448
square and runs the model synchronously:

```ts
onFrame={(frame, render) => {
  'worklet';
  const cmd = scanCmd.getDirty();
  if (cmd === 'frozen') { frame.dispose(); return; }

  if (cmd === 'capturing' && model != null && resizer != null) {
    const resized = resizer.resize(frame);
    const outputs = model.runSync([resized.getPixelBuffer()]);
    resized.dispose();

    // lite2 output order, verified against model.outputs:
    //   [0] boxes [1,25,4] | [1] classes | [2] scores | [3] detection count
    const boxes = new Float32Array(outputs[0]!);
    const scores = new Float32Array(outputs[2]!);
    // ...filter by `threshold`, draw with Skia, then
    scanCmd.setBlocking('frozen');
    scheduleOnRN(onScanned, found, frame.width, frame.height);
  }
}}
```

Model coordinates live in the letterbox square, not in frame space. Placing touch
targets over the drawn boxes therefore takes two conversion stages — letterbox →
frame pixels → screen pixels (the canvas draws with `fit="cover"`):

```ts
// src/boxLayout.ts
const r = boxToScreen(detection, frameSize.w, frameSize.h, winW, winH);
// → { left, top, width, height } in screen pixels
```

Model details, the specs verified on a real device, and what must be re-checked
when swapping models: [assets/models/README.md](assets/models/README.md).

## Testing

```bash
npm test
```

Both suites target coordinate conversion — the place where a few dozen pixels of
drift is nearly impossible to spot by eye on a real device:

- [`__tests__/letterbox.test.js`](__tests__/letterbox.test.js) — letterbox square
  to frame pixels
- [`__tests__/boxLayout.test.js`](__tests__/boxLayout.test.js) — `boxToScreen()`
  end to end

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
    boxLayout.ts       # Box coordinate mapping: letterbox → frame → screen
    constants.ts       # MODEL_SIZE, PERSON_CLASS_ID, threshold, max detections
    labels.ts          # The 90 COCO labels + Vietnamese translations
    theme.ts           # Colours, fonts, radii, easing curves
    components/        # HUD: glass surfaces, buttons, threshold slider, zoom picker, detail sheet
    hooks/             # useAlert (haptics), useSavePhoto (save to photo library)
    screens/           # DetectorScreen: camera, scan worklet, the whole HUD
  assets/
    fonts/             # Geist (SIL OFL), linked with react-native-asset
    models/            # efficientdet_lite2.tflite + extracted metadata
  __tests__/           # Box coordinate tests
  patches/             # patch-package patch for react-native-fast-tflite
  android/             # Android project (bare workflow)
  ios/                 # iOS project + Podfile
```

## Engineering notes

- **The model runs on CPU.** The GPU delegate (`'android-gpu'`) was tried and made
  FPS worse: TFLite's GPU delegate supports quantized uint8 models poorly on many
  mid-range chips.
- **The label font must be a family that really exists on the device.** `'System'`,
  `'Roboto'` and the empty string all return a Typeface that looks valid but has
  no glyphs — text measures to `width = 0` and draws invisibly. On Android only
  `'sans-serif'` works.
- **Zoom and torch may only be set after `onStarted`.** Setting them earlier makes
  CameraX throw `Camera is not active`; the `OperationCanceledException` raised
  while the camera session restarts is harmless and is swallowed deliberately.
- **Changing the threshold only affects the next capture** — boxes are baked into
  the frozen image, so previous results cannot be re-filtered.
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
