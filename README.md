# Tally — Face Counter

A React Native app that counts **faces** in the camera frame, live. There is no
shutter: a WIDER FACE-trained YOLO26 runs on TFLite on-device as fast as the
phone allows, boxes follow the faces between runs, and the count updates as you
move the camera. A scan writes itself to history once the number holds still.

One class, one colour, one number. Detection is fully on-device — no frame
leaves the phone. Recognition (putting a name to a face) does: the ArcFace
embedding step runs on a server you host yourself, see
[docs/arcface-server.md](docs/arcface-server.md). History is backed by a
Supabase account: signing in syncs scans (and their thumbnails) across devices
and restores them after a reinstall.

> **Detection rate.** One pass measures ~440ms on a mid-range device (Tecno
> LI6, GPU delegate, 411/411 nodes), so the count refreshes roughly twice a
> second rather than every frame. The preview itself stays smooth — the frame
> is drawn before detection runs, never after. A 320-input export of the same
> model is roughly four times cheaper and is the intended next step; it needs
> only `MODEL_SIZE` changed once the file exists.

> The bundled model is an Ultralytics YOLO26 export, licensed **AGPL-3.0**.
> Review the terms (or obtain a commercial licence) before shipping a
> closed-source build.

## Features

- **Continuous detection, no shutter.** The worklet runs the model on the
  camera thread whenever the previous run has finished (with a floor of 200ms
  so a faster model cannot starve rendering), and reports back to JS. Boxes are
  drawn from tracks, not raw detections, so they persist between runs instead
  of blinking at 2Hz.
- **Face tracking by overlap.** [`trackFaces`](src/shared/tracker.ts) matches
  each round's detections to the faces already on screen (greedy, best overlap
  first), so a face keeps one stable id while it moves, and survives a missed
  round or two. That id is what recognition results are keyed by - a face is
  identified once, not several times a second.
- **Scans record themselves.** When the count stops changing for two seconds,
  the scene is written to history with a snapshot. Keyed on the count itself,
  so holding the camera on the same people records once rather than every two
  seconds.
- **YOLO26 trained on WIDER FACE, single class** — `[1, 3, 640, 640]` float32
  NCHW input, raw `[1, 5, 8400]` head (4 box coordinates + 1 score) with no NMS
  in the graph. Shapes read straight out of the FlatBuffer, not guessed — see
  [assets/models/README.md](assets/models/README.md).
- **One pass, whole frame.** The shutter used to run a second, centre-cropped
  pass to catch small faces. At ~440ms each that would put the count a full
  second behind the scene, so only the letterboxed pass survives - the number
  has to describe what you can actually see.
- **Face recognition.** MediaPipe FaceMesh (468 landmarks, on-device) gates on
  head pose and supplies the five alignment points; the embedding itself comes
  from an ArcFace server over HTTP (`POST /embed`). Names appear on the boxes as
  each face is identified. Without a server configured, counting still works and
  nobody is named.
- **Native buffer rotation** (`enablePhysicalBufferRotation`) so the model always
  receives an upright image instead of one rotated 90° to match the sensor.
- **Tap any box for details**: the label, the model's confidence, and who the
  face belongs to.
- Camera controls: front/back flip and tap-to-focus on the viewfinder; zoom and
  the confidence threshold live in Settings, since neither is something you
  adjust shot by shot when there are no shots.
- Haptic alert when a scan records itself (toggle in Settings).
- Adaptive portrait/landscape layout.
- **A floating header** on the camera screen (History, lens, Settings) — see
  [`DetectorScreen`](src/screens/DetectorScreen.tsx). The bottom of the screen
  is deliberately bare: there is nothing left to press.
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
- **A rolling week summary** above the history list — scans and faces over the
  last 7 days ([`weekTotals`](src/shared/history.ts)). Rolling rather
  than a calendar week, so it does not blank out every Monday for someone who
  counts at weekends.
- **CSV export, of everything or of a selection.** `toCsv` writes one row per
  scan (`time,faces`) to the system share sheet; with rows ticked in selection
  mode it exports just those, since the list already knows which ones you mean.
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
| `VIBRATE` | Android | Haptic alert when faces are detected |
| `INTERNET` | Android | Metro dev server in debug builds, plus Supabase auth and history sync in every build |

## How it works

A scan's lifecycle fits in three states: `idle` (preview) → `capturing` (scan the
next frame) → `frozen` (camera off, image held).

Detection happens in a worklet while the UI runs on the JS thread, so the
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

The worklet deliberately does no filtering or tracking. Both need the frame's
dimensions to reach one coordinate system, and both have to stay testable
without a camera — so they live on the JS side as plain, unit-tested functions:

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
the model's square is not the frame's. Getting a box onto the screen is therefore
two conversions: model square → frame space (`toFrameBox`, the only place that
knows which pass a box came from), then frame space → screen pixels (`boxToScreen`,
which undoes the canvas's `fit="cover"`):

```ts
// src/shared/boxLayout.ts
const r = boxToScreen(detection, frameSize.w, frameSize.h, winW, winH);
// → { left, top, width, height } in screen pixels
```

The same `boxToScreen` maps the tracker's boxes onto the screen every time a
detection round lands, which is what keeps the overlay aligned with the preview
underneath it.

Face enrolment reaches the same place by a different route. It works from a
still rather than the live stream, so there is no `Frame` and therefore no
resizer: `scanImage.ts` draws the snapshot into a 640×640 offscreen Skia
surface itself and reads the pixels back. That hand-built placement has to agree
exactly with what `toFrameBox` assumes about the square, which is why
`modelDestRect` and `toFrameBox` live in the same file and are tested against
each other.

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
      labels.ts        #   The detector's one class name, inflected for count
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
      modelInput.ts    #   Shared pixel-building for the TFLite models, and the
                       #     JPEG crop the embedding server receives
      runModel.ts      #   Model output parsing, called from the camera worklet
      scanImage.ts     #   Scan a still (face enrolment): Skia-built model input
      faceMesh.ts      #   FaceMesh: pose gate, alignment points, the mask
      meshLandmarks.ts #   The landmark maths, free of Skia so it can be tested
      meshTopology.ts  #   MediaPipe's 880-triangle tessellation (Apache-2.0)
      embedClient.ts   #   POST /embed: 1-8 faces a call, base64 JPEG in, vectors
                       #     out, with the model's name attached
    components/        # One file per component. HUD (detection boxes, photo
                       #   threshold slider, detail/history sheets) plus the
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
    models/            # widerfaceyolo26.tflite + notes on its verified tensor layout
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
  the models were re-exported as clean float32 (rather than the quantized
  uint8 model this app started with, which GPU delegates handle poorly),
  Invoke ran clean on a real device (Tecno LI6): detections matched the CPU
  run exactly, give or take the drift expected from GPU floating-point
  accumulating in a different order than CPU. The measurement predates the
  switch to the face model, which is the same export path and the same input
  square, so it should carry over — but it has not been re-measured on device.
  The load-time fallback to CPU in
  `useEffect` still only catches failures at load, not at Invoke, so a
  different device could in principle still need it.
- **The Skia label font must be a family that really exists on the device.**
  `'System'`, `'Roboto'` and the empty string all return a Typeface that looks
  valid but has no glyphs — text measures to `width = 0` and draws invisibly. On
  Android only `'sans-serif'` works. On-screen labels are RN text in the bundled
  Geist family, so this no longer bites anywhere in the app.
- **Zoom may only be set after `onStarted`.** Setting them earlier makes
  CameraX throw `Camera is not active`; the `OperationCanceledException` raised
  while the camera session restarts is harmless and is swallowed deliberately.
- **Pixel layout depends on how the model was exported, not on which model it is.**
  Both bundled models were exported with Ultralytics 8.4.118, whose litert-torch
  path emits NCHW — their `serving_default_*` tensor names give that away, and it
  is why `renderToInput` can serve both. The ready-made downloads on the
  Ultralytics site come from the older ONNX→TF path and are NHWC instead. Feed a
  model the wrong layout and it still runs and still returns numbers, just
  meaningless ones.
- **A single-class detector deletes more than it adds.** Switching from COCO's
  80 classes to face-only removed the class filter, the second box colour and
  the whole ImageNet refine step — about 1,650 lines and an 11MB asset — because
  each existed only to tell classes apart. The refine step was a poor fit
  regardless: ImageNet-1k has no person class, so naming a face crop could only
  ever return a garment or a backdrop (measured on device: "sarong" at 6%).
- **Never write a Reanimated shared value in a render body.** Strict mode warns
  about it, and the fix is always an effect keyed on the prop that drives the
  animation. Reading `.value` during render counts too.
- **The worklet applies only a hard floor** (`RAW_SCORE_FLOOR`), not the user's
  threshold. Everything above the floor is shipped to JS so the slider can reveal
  detections after the fact; the floor must stay below the slider's minimum
  (`0.2`).
- **One threshold, no per-class exceptions.** Back when there were 80 classes,
  lowering the bar for non-`person` ones was tried — they do score lower at
  equal detection quality — and removed: a slider reading 90% that still showed
  a 73% object made the number on screen a lie. `passesThreshold` stays
  class-blind, and `__tests__/detections.test.js` still pins that.
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
| [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera) | Camera, permissions, zoom, focus |
| [`react-native-vision-camera-skia`](https://github.com/mrousavy/react-native-vision-camera) | `SkiaCamera` — frame rendering through Skia, `takeSnapshot()` |
| [`react-native-vision-camera-resizer`](https://github.com/mrousavy/react-native-vision-camera) | GPU-accelerated frame resize to the model's input size |
| [`react-native-fast-tflite`](https://github.com/mrousavy/react-native-fast-tflite) | Loading and running `.tflite` via `runSync` inside the worklet |
| [`react-native-worklets`](https://github.com/margelo/react-native-worklets) | `createSynchronizable`, `scheduleOnRN` — the JS ↔ worklet bridge |
| [`@shopify/react-native-skia`](https://github.com/Shopify/react-native-skia) | Drawing boxes and labels, encoding the image on save |
| [`react-native-nitro-image`](https://github.com/mrousavy/react-native-nitro-image) | Writing Skia image bytes out to a temporary file |
| [`@react-native-camera-roll/camera-roll`](https://github.com/react-native-cameraroll/react-native-cameraroll) | Saving the image to the photo library |
| [`react-native-reanimated`](https://github.com/software-mansion/react-native-reanimated) | HUD animations |
| [`@react-native-community/blur`](https://github.com/Kureev/react-native-blur) | Frosted-glass backgrounds for the HUD cards |
| [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) | Auth (email/password) and the Postgres/storage backend for history sync |
| [`axios`](https://github.com/axios/axios) | The one HTTP client, for the embedding server: base URL, bearer token, timeout, and every failure flattened into a single error type in one interceptor |
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
