# Tally — ObjectDetector

A React Native app that detects and counts objects in the camera frame. Press the
shutter and the app scans **exactly one frame** with YOLO26n running on TFLite
on-device, freezes that frame, and lays labelled bounding boxes over it so you can
inspect, re-filter and save the result.

It recognises all 80 COCO classes, with people highlighted in green and everything
else in amber. Detection itself is fully on-device — no frame ever leaves the
phone. History is backed by a Supabase account: signing in syncs scans (and
their thumbnails) across devices and restores them after a reinstall.

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
  threshold slider (default `0.5`, user-configurable — see Settings below).
- Haptic alert when people are detected (toggle in Settings), and saving the
  annotated image to the device photo library.
- Adaptive portrait/landscape layout for every control cluster.
- **A floating header** on the camera screen (History, Settings) alongside the
  bottom toolbar (torch, library, running total, flip) — see
  [`DetectorScreen`](src/screens/DetectorScreen.tsx).
- **Account-gated with Supabase auth.** [`AuthScreen`](src/screens/AuthScreen.tsx)
  (email/password register or sign in) is the only thing rendered until
  [`useAuth`](src/hooks/useAuth.ts) reports a real, non-anonymous session — the
  camera in `DetectorScreen` is unreachable otherwise, see [App.tsx](App.tsx).
- **History synced to the cloud.** Each scan uploads its row and thumbnail to
  Supabase in the background ([`uploadScan`](src/shared/cloudSync.ts)); the
  local [MMKV](https://github.com/mrousavy/react-native-mmkv) copy stays the
  fast path the app actually reads from, and the cloud copy is what
  [`restoreFromCloud`](src/shared/cloudSync.ts) pulls back down when local
  storage is empty (reinstall or a new device). Full-size previews sync the
  same way, lazily, only when a scan is opened.
- **Uploads survive being offline.** Counting works with no signal, so an upload
  that fails cannot just be logged and forgotten — the scan would be missing
  from the backup permanently. Every scan is queued in
  [`pendingSync.ts`](src/shared/pendingSync.ts) *before* the request goes out
  and cleared only once it lands, and the queue is retried on launch and again
  whenever the app returns to the foreground (the usual case: scan with no
  signal, pocket the phone, get a connection back without ever restarting).
  Deletes queue the same way, so a scan removed offline does not come back on
  the next restore. Both `uploadScan` and the storage upload are idempotent
  (`upsert`), since a retry cannot know how much of the previous attempt landed.
- **Older scans paged back from the cloud.** Local history is capped at
  `HISTORY_LIMIT` (50) but the Supabase table is not, so everything past the cap
  was already backed up with no way to read it. A "show older" button at the
  foot of the list pulls pages of 25 down on demand
  ([`fetchOlderScans`](src/shared/cloudSync.ts)) — a button rather than
  infinite scroll, because each page downloads a thumbnail per row. Paged-in
  records are display state only and never written back to MMKV, which would
  break the 50-record cap the local store promises.
- **A rolling week summary** above the history list — scans, people and objects
  over the last 7 days ([`weekTotals`](src/shared/history.ts)). Rolling rather
  than a calendar week, so it does not blank out every Monday for someone who
  counts at weekends.
- **CSV export, of everything or of a selection.** `toCsv` writes tidy data (one
  row per class per scan) to the system share sheet; with rows ticked in
  selection mode it exports just those, since the list already knows which ones
  you mean.
- **A Settings screen** ([`SettingsScreen`](src/screens/SettingsScreen.tsx),
  reached from the camera header): switch language instantly at runtime, toggle
  the haptic alert, set the confidence threshold a session starts with, clear
  local scan history, and sign out.
- **The app draws its own dialogs.** [`Dialog.tsx`](src/components/Dialog.tsx)
  replaces React Native's `Alert`, which renders the OS dialog — Material on
  Android, UIKit on iOS — so the surface asking to delete a scan looked nothing
  like the screen it was asked from, and different again on the other platform.
  It is an absolutely positioned overlay rather than a `Modal`, because
  `SettingsScreen` is itself one and stacking Modals on Android means two
  windows fighting over the same back button.

## Requirements

- Node.js `>= 22.11.0`
- React Native 0.86.2 (bare workflow — no Expo)
- **Android**: `minSdkVersion 26`, `compileSdk`/`targetSdk 36`
- **iOS**: React Native's `min_ios_version_supported`, plus CocoaPods via Bundler
- A physical device with a camera — this pipeline does not run on simulators
- A network connection for sign-in and history sync (detection itself works offline)

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

Sign-in and history sync need a Supabase project URL and anon key, read at
build time via [`react-native-dotenv`](https://github.com/goatandsheep/react-native-dotenv)
(`@env` in [`src/shared/supabase.ts`](src/shared/supabase.ts)). Copy the
example and fill in your project's values:

```bash
cp .env.example .env
```

`.env` is gitignored; restart Metro with `--reset-cache` after changing it, since
the values are inlined at bundle time.

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

### All scripts

| Script | What it does |
|---|---|
| `npm start` | Metro bundler |
| `npm run android` / `npm run ios` | build, install, run |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest |
| `npm run verify` | lint + typecheck + test — what CI runs |
| `npm run release` | signed APKs, one per phone ABI |
| `npm run release:aab` | App Bundle for the Play Store |
| `npm run release:github` | build, then publish a GitHub Release |

The three `release*` scripts wrap fastlane lanes, so they need `bundle install`
first — see [Fastlane](#fastlane) below. Publishing normally happens by pushing
a tag rather than by running `release:github` by hand.

### Release builds

Release enables R8 minification. `proguard-rules.pro` keeps
`org.tensorflow.lite.**` and `com.google.ai.edge.litert.**` — those classes are
reached only through JNI `FindClass`, so R8 cannot see the references and would
otherwise strip them, crashing the app on model load.

Signing reads four Gradle project properties. Supply them as
`ORG_GRADLE_PROJECT_*` environment variables — Gradle's own convention for
passing a project property through the environment — by copying
[`fastlane/.env.example`](fastlane/.env.example) to `fastlane/.env`, which
fastlane loads automatically and the Gradle subprocess inherits:

```bash
cp fastlane/.env.example fastlane/.env
```

CI sets those same variable names from repository secrets, so a local release
and a CI release are signed through one mechanism instead of two. Environment
variables also keep the passwords out of the process list, unlike `-P` flags.

`fastlane/.env` is gitignored, as are `*.keystore` and `*.jks` — keep the
keystore itself outside the repo entirely.

Running `./gradlew` directly instead of through a lane bypasses the `.env`
loading; put the same four properties in `~/.gradle/gradle.properties` if you
want that path to sign too.

Without any of them the release build falls back to the debug key, so it still
builds and installs for local testing — it just cannot be published.

### Fastlane

The build commands live in [`fastlane/Fastfile`](fastlane/Fastfile) so a local
release and a CI release run the same code path. Requires Ruby:

```bash
bundle install
```

| Lane | npm script | What it does |
|---|---|---|
| `fastlane android install` | — | debug APK, installed on the connected device |
| `fastlane android release` | `npm run release` | signed APKs, one per phone ABI |
| `fastlane android bundle` | `npm run release:aab` | App Bundle for the Play Store |
| `fastlane android github tag:v1.0.0` | `npm run release:github` | the release lane, then publish to GitHub |

Prefix the lanes with `bundle exec`. The `install` lane has no npm script
because `npm run android` already builds, installs, and starts Metro.

Signing stays entirely Gradle's business in every lane, reaching it as
`ORG_GRADLE_PROJECT_*` environment variables from `fastlane/.env` locally and
from repository secrets in CI, so there are no credentials in the Fastfile.

`fastlane/.env.default` is committed and holds only non-secret defaults — right
now just the key alias, which `keytool -list` prints from any keystore and which
therefore does not deserve to be a secret. That is why CI needs three secrets
rather than four.

### What the lanes run underneath

Play splits an AAB per-ABI on the server, so `bundleRelease` needs no ABI
configuration and no per-APK `versionCode` juggling:

```bash
cd android && ./gradlew bundleRelease
```

`assembleRelease` on its own produces one universal APK carrying all four ABIs —
around 211MB, of which ~98MB is the `x86`/`x86_64` libraries that only an
emulator ever loads. `-PsplitApks` emits one APK per phone ABI instead:

```bash
cd android && ./gradlew clean
```

```bash
cd android && ./gradlew assembleRelease -PsplitApks
```

Two invocations, not `./gradlew clean assembleRelease`. Combined, `clean` deletes
the autolinked libraries' `prefab_package` directories while the task graph
already assumes they exist, and the app's CMake configure step dies on
`prefab: directory … is not readable`. The `release` lane runs them separately
for this reason.

The `clean` itself matters: React Native's asset-copy task only ever adds to
`android/app/build/generated/res/react/`, so a model removed from `assets/models`
keeps shipping in the APK until the directory is wiped.

Measured on a clean build: **73MB** for `arm64-v8a`, **59MB** for `armeabi-v7a`,
down from a 211MB universal APK.

### Publishing

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml),
which calls the `github` lane to build both APKs and attach them to a GitHub
Release. It needs five repository secrets, and fails fast if any is missing
rather than publishing a debug-signed or backend-less build:

| Secret | Value |
|---|---|
| `TALLY_KEYSTORE_BASE64` | `base64 -w0 tally-release.jks` |
| `TALLY_STORE_PASSWORD` | keystore password |
| `TALLY_KEY_PASSWORD` | key password |
| `TALLY_SUPABASE_URL` | same value as `SUPABASE_URL` in your local `.env` |
| `TALLY_SUPABASE_ANON_KEY` | same value as `SUPABASE_ANON_KEY` in your local `.env` |

The workflow writes the last two into a `.env` file before the build, since
`react-native-dotenv` inlines them into the JS bundle at bundle time (see
[Installation](#installation)) — without them the release APK would build fine
and only fail at sign-in.

The key alias is not a secret — it comes from
[`fastlane/.env.default`](fastlane/.env.default). Change it there if your
keystore uses a different alias.

Generate the keystore once and keep it safe — losing it means losing the ability
to ship updates to anyone who already installed the app:

```bash
keytool -genkeypair -v -keystore tally-release.jks -alias tally -keyalg RSA -keysize 2048 -validity 10000
```

The APK itself never belongs in the repository: GitHub caps files at 100MB, and
a binary committed once stays in the history for every future clone.

## Permissions

| Permission | Platform | Why it's needed |
|---|---|---|
| `CAMERA` / `NSCameraUsageDescription` | Android, iOS | Frame source for scanning |
| `VIBRATE` | Android | Haptic alert when people are detected |
| `READ_MEDIA_IMAGES` (API 33+) / `READ_EXTERNAL_STORAGE` (≤ 32) / `NSPhotoLibraryUsageDescription` | Android, iOS | Listing library photos so one can be picked and scanned |
| `WRITE_EXTERNAL_STORAGE` | Android ≤ 28 | Saving the annotated image; from API 29 MediaStore handles it, so it is only requested on older devices |
| `INTERNET` | Android | Metro dev server in debug builds, plus Supabase auth and history sync in every build |

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
- [`__tests__/i18n.test.js`](__tests__/i18n.test.js) — the half of the
  translation contract `tsc` cannot see: placeholders resolving, `count: 1` vs.
  `count: 3` actually producing different English, `PLURAL_KEYS` matching
  exactly the keys with `{ one, other }` forms, and the two catalogs agreeing
  key for key and placeholder for placeholder. Nothing here asserts Vietnamese
  or English text, since the active locale depends on where the suite runs —
  jest resolves to `en`
- [`__tests__/i18nRuntime.test.js`](__tests__/i18nRuntime.test.js) — the
  runtime-switching machinery `i18n.test.js` deliberately never touches:
  `setLocale()` actually flipping `t()` output and the live `locale` binding
  other modules read, a saved preference applying at module load (simulated
  with `jest.isolateModules()` — a plain `jest.resetModules()` here would
  reset React itself between tests and break `useLocale()`'s hooks), an
  invalid stored value falling back instead of sticking, and `useLocale()`
  actually re-rendering a subscribed component with no context or props
  involved
- [`__tests__/history.test.js`](__tests__/history.test.js) — day grouping and
  `weekTotals()`, above all the window edges: the oldest day in the rolling week
  is included in full and the day before it is not. Both count back with
  `setDate` rather than subtracting `86400000`, because a day is not always 24
  hours — across a US spring-forward, subtracting six days lands at 23:00 on the
  *previous* day
- [`__tests__/pendingSync.test.js`](__tests__/pendingSync.test.js) — the offline
  retry queue, including the invariant that keeps a deleted scan deleted:
  queueing a delete drops that id from the upload queue, so a scan removed
  before its upload landed is not recreated in the cloud by the next flush.
  Plus a corrupt queue degrading to empty rather than throwing on launch
- [`__tests__/dialog.test.js`](__tests__/dialog.test.js) — the first component
  test in the project: a notice getting a single dismiss button, an action
  running and closing, cancel closing without running the other action. It
  doubles as a canary for the Reanimated Jest setup below, since a regression
  there silently costs the whole UI its testability

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
      labels.ts        #   The 80 COCO labels + Vietnamese translations, labelForCount()
      theme.ts         #   Colours, fonts, radii, easing curves
      history.ts       #   ScanRecord, day grouping, local JSON (de)serialisation
      thumbnail.ts     #   Encoding a scan's thumbnail/preview JPEGs
      export.ts        #   Sharing/exporting a saved scan
      storage.ts       #   The one shared MMKV instance, + an async-shaped adapter for Supabase
      settings.ts      #   Haptics/defaultThreshold: shape, defaults, MMKV (de)serialisation
      supabase.ts      #   Supabase client (MMKV-backed session via storage.ts), getUserId()
      cloudSync.ts     #   Uploads/downloads scans, thumbnails and previews to Supabase
      pendingSync.ts   #   Retry queue: scan ids the cloud has not accepted yet
      authErrors.ts    #   Supabase auth errors → translated copy; email/password checks
    i18n/              # All UI copy: Vietnamese is the source of truth, English typed against it
      vi.ts            #   Vietnamese catalog (source of truth) + the Params contract
      en.ts            #   English catalog, typed against vi
      index.ts         #   i18n-js instance, locale detection/override, setLocale, useLocale, t()
    detection/         # The model pipeline, orchestrated only by DetectorScreen
      annotate.ts      #   Burn boxes into the photo at save time (offscreen Skia)
      classify.ts      #   Second-stage: crop a box, name it from 1000 ImageNet classes
      imagenetLabels.ts #  The 1000 ImageNet labels (generated from the model's metadata)
      modelInput.ts    #   Shared pixel-building for both TFLite models (NCHW)
      runModel.ts      #   Model output parsing, shared by the camera and photo paths
      scanImage.ts     #   Scan a library photo: Skia-built model input, both passes
    components/        # One file per component. HUD (detection boxes, class filter,
                       #   photo picker, threshold slider, detail/history sheets) plus the
                       #   shared primitives: GlassSurface, CtaButton, SegmentedTabs,
                       #   FormField, AmbientBackdrop, IconButton, Dialog (the app's own
                       #   Alert), icons (Skia) and modalIcons/Checkbox (plain View, for
                       #   use inside a Modal, where a Skia Canvas draws nothing on Android)
    hooks/             # useAuth (Supabase session), useSettings (haptics/defaultThreshold),
                       #   useScanHistory (local + cloud history), useCameraControls,
                       #   useClassFilter, useRefinedLabel, useAlert (haptics, mutable via
                       #   Settings), useSavePhoto, useEnter (entry animation)
    screens/           # AuthScreen (sign in/register), DetectorScreen (camera, scan worklet,
                       #   the whole HUD), SettingsScreen (language, haptics, default
                       #   threshold, clear history, sign out)
  assets/
    fonts/             # Geist (SIL OFL), linked with react-native-asset
    models/            # yolo26n.tflite + notes on its verified tensor layout
  __mocks__/
    react-native-mmkv.js # Jest replacement for the native module - see Testing above
  __tests__/           # Box coordinates, history/sync logic, the i18n contracts, and
                       #   the first component test (Dialog)
  jest.setup.js        # Registers reanimated's animated-style matchers - see Testing
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
  also accepts `\` for Windows paths). Transforming them is necessary but not
  sufficient — two of them also touch native modules at import time, see
  [Native modules under Jest](#native-modules-under-jest).
- **A `Modal` is its own window on Android, with consequences in three places.**
  A Skia `<Canvas>` inside one draws nothing, which is why `modalIcons.tsx` and
  `Checkbox.tsx` redraw their glyphs from plain Views; stacking a second `Modal`
  on top means two windows fighting over the back button, which is why both
  `Dialog` and `HistorySheet`'s photo viewer are absolutely positioned overlays
  instead; and the window that is on top owns the back press, so `Dialog`'s own
  `BackHandler` only fires on a plain screen — inside a `Modal` the host chains
  it through `onRequestClose` instead.

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
| [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) | Auth (email/password) and the Postgres/storage backend for history sync |
| [`react-native-mmkv`](https://github.com/mrousavy/react-native-mmkv) | The one on-device key/value store — history/preview cache, settings, the locale override, and (via an async-shaped adapter) the session store `supabase-js` persists into |
| [`i18n-js`](https://github.com/fnando/i18n-js) | Translation lookup, interpolation and locale fallback — see [`src/i18n/`](src/i18n) |

## License

[AGPL-3.0](LICENSE).

The licence is not a free choice here: the bundled Ultralytics YOLO26n weights
are themselves AGPL-3.0, and that obligation reaches the whole app. In practice
that means anyone you distribute a build to — including over a network — is
entitled to the corresponding source. If you need to ship a closed-source build,
the route is a [commercial licence from Ultralytics](https://ultralytics.com/license),
not a different licence on this repository. See
[assets/models/README.md](assets/models/README.md) for the model's own terms.

Geist, in [assets/fonts](assets/fonts), is licensed separately under the SIL
Open Font License.
