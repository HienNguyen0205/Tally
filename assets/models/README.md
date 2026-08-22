# Models

**Two** models ship in the app now:

| File | Job | Runs when | In / out |
|---|---|---|---|
| `widerfaceyolo26.tflite` | Face detection, single class | Continuously, on the camera thread | `[1,3,320,320]` NCHW 0..1 / `[1,5,2100]` |
| `mediapipe_face-tflite-float/face_landmark_detector.tflite` | 468 face landmarks: pose gate, the five alignment points, the mask overlay | Once per detected face, after a scan freezes | `[1,192,192,3]` NHWC 0..1 / `[1,468,3]` + `[1]` |

Shapes read straight from each FlatBuffer with `tools/inspect_tflite.py`.

> **`arcface.tflite` no longer ships.** The 512-number embedding is produced by
> a self-hosted server over WebSocket - see `docs/arcface-server.md`. That took
> 22MB and a CPU-only Vision Transformer out of the app, and cost the app its
> ability to recognise anyone offline. Counting faces still works with no
> signal; naming them does not. The file is still in this folder, referenced by
> nothing, and can be deleted.

> **`facemap_3dmm.tflite` is gone, and `mediapipe_face-tflite-float/face_detector.tflite`
> is unused.** facemap did the pose gate in 21.7MB and could never draw
> anything: it emits 3DMM *coefficients*, and turning them into geometry needs
> three basis matrices (`meanFace`, `shapeBasis` 204x219, `blendShape` 204x39)
> that ship separately from the model. FaceMesh does the same job in 2.4MB and
> hands over the geometry directly, so facemap was dropped. The MediaPipe
> *detector* beside it (BlazeFace, 256x256, 0.57MB) was evaluated as a
> replacement for YOLO and **not** adopted: it is 67x smaller and Apache-2.0
> rather than AGPL, but it is built for a few near faces, and this app's whole
> output is a count of faces in a scene. Both files can be deleted if nothing
> revisits that decision.

## Landmark units, and the guard around them

FaceMesh's graph ends in a `RESHAPE` with no normalisation after it, so the 468
landmarks arrive in **pixels of the 192 square** — MediaPipe's convention, not
0..1 like the detector's boxes. `landmarksToReading` divides by `MESH_SIZE`
only when the numbers actually look like pixels, so an export that normalised
them itself would not be divided twice into a dot in the corner. Pinned by
`__tests__/meshLandmarks.test.js`.

## The mesh topology is a separate table

The 468 landmarks are points, not a surface. Drawing them as a lattice needs
MediaPipe's canonical tessellation - 880 triangles, 1348 unique edges - which
lives in `src/detection/meshTopology.ts`, copied from TensorFlow.js's
face-landmarks-detection demo (Copyright 2020 Google LLC, **Apache-2.0**, kept
in the file header).

It cannot be derived at runtime: a Delaunay triangulation over these points
would web the eyes and mouth shut and throw skin across the gaps, having no
idea which holes are meant to be holes. `MESH_EDGES` is derived from the
triangles at module load, so each shared edge is stroked once rather than
twice - pinned by `__tests__/meshTopology.test.js`.

The yaw and pitch it derives are **estimates, not measurements**: FaceMesh's
`z` is roughly in the same units as `x`, so the depth difference across the eye
line (and down the forehead-to-chin axis) gives an angle through `atan2`. Good
enough for "is this face turned too far to recognise", which is all
`poseUsable` asks. Roll is the one real measurement — the angle of the eye
line — and it is fed back into `renderToInput`'s `spin` so ArcFace sees a
level face.

Exported through the Ultralytics litert-torch path (recognizable by the
`serving_default_*` tensor names), so it takes **NCHW** — `renderToInput` in
`src/detection/modelInput.ts` builds its pixel input.

> **Pixel layout depends on the EXPORT PATH, not on the model.** The ready-made
> downloads on the Ultralytics site go through the older ONNX→TF path and come
> out **NHWC** (`[1, 640, 640, 3]`, tensor names `images`/`Identity`). Feed a
> model the wrong layout and it still runs and still returns numbers — just
> meaningless ones, with no error. Check the shape first, then adjust
> `RESIZER_FORMAT.pixelLayout` and the pixel loop in `renderToInput` to match.

> **License: AGPL-3.0.** Ultralytics models carry an AGPL obligation — review
> the terms (or get a commercial license) before shipping a closed-source build.
> https://ultralytics.com/license

## Verified tensor layout

Read straight from the `.tflite` FlatBuffer with `tools/inspect_tflite.py` — not
guessed:

| | |
|---|---|
| Input | `[1, 3, 320, 320]` float32 **NCHW**, values 0..1 |
| Output | `[1, 5, 2100]` float32 |
| 5 channels | `cx, cy, w, h` + 1 face score (already sigmoid'd) |
| 2100 anchors | 40² + 20² + 10², one per stride level |
| Labels | one class, `face` = 0 |
| Offset buffers | 0 — see the trap below |

> **`MODEL_SIZE` must match this file, and nothing checks that it does.** The
> file was once replaced with a 320 export while the constant still said 640:
> the resizer kept producing 1,228,800 floats for a model wanting 307,200,
> TFLite accepted the oversized buffer silently, read the first quarter of it
> and returned no detections at all. A face filling the frame counted as zero,
> with no error anywhere. Run `tools/inspect_tflite.py` after every swap.
Only the channel count moved, from 84 to 5 (`NUM_CLASSES` in
`src/shared/constants.ts`).

Output is **channel-major**: the value for channel `c` at anchor `a` sits at
`c * 8400 + a`, NOT `a * 5 + c`. Coordinates are already normalized to 0..1
(the graph is wrapped in `ultralytics.utils.export.engine._NormalizeCoords`).

There is no NMS in the graph (`end2end: false`), so the app filters it itself
via `mergeDetections()`. That's a deliberate choice — the end2end variant
returns a pre-filtered `[1, 300, 6]`, which is leaner but bakes in a confidence
cutoff Ultralytics fixed at export time, making the app's threshold slider a
no-op past that point.

The two output formats have nothing in common, and getting it wrong produces no
error. Check the shape first, then update `parseDetections`; the current format
is locked in by `__tests__/parseDetections.test.js`.

> **Why this model stays.** MediaPipe's BlazeFace detector sits in this folder
> and would cut 38MB and an AGPL obligation. It was not adopted because it runs
> at 256 with 896 anchors against this one's 640 with 8400: fewer, larger faces
> is the trade, and a count is the product. If that trade ever becomes
> acceptable, the decode is the work — BlazeFace emits raw logits (no
> `LOGISTIC` op anywhere in its graph) and anchor-relative coordinates in input
> pixels, where YOLO emits absolute, already-sigmoided numbers.

## Trap: buffers stored outside the FlatBuffer

The runtime bundled with `react-native-fast-tflite` is
`com.google.ai.edge.litert:litert:1.4.0`, and it **cannot resolve offset-style
buffers**. The TFLite schema allows a buffer to leave its `data` field empty and
instead point via `offset`/`size` at another location in the file —
`ai_edge_litert`'s quantizer writes exactly that shape.

> **Every quantization level triggers this, not just INT8.** Tried
> `quantize=int8` (107 offset buffers) and `quantize=w8a32` (107 in the
> detector, 48 in the classifier) — both broken the same way. The culprit is
> how the quantizer re-serializes the file, not the scheme, so **W8A16 is almost
> certainly broken too**.
>
> Practical takeaway: **export FP32 only.** To cut file size, lower `imgsz` or
> switch to a smaller model — don't touch `quantize`.

Symptom: the model **loads fine**, every shape checks out, but `runSync` throws
`Failed to run TFLite Model! Status: error`, and logcat shows:

```
E tflite : Input tensor <n> lacks data
```

That tensor is a Conv layer's weights. There's no fix on the app side — the
model has to be re-exported so its weights land inside the FlatBuffer.

Check any file in seconds, no tensorflow install required:

```bash
python3 tools/inspect_tflite.py assets/models/widerfaceyolo26.tflite
```

It prints the input/output shapes and the offset-buffer count. Anything other
than 0 means the file won't run — the bundled model reports 0.

## Trap: a model the GPU delegate cannot build at all

`arcface.tflite` must be loaded with **no delegate**. Handing it
`['android-gpu']` fails with:

```
Failed to load Tensorflow Model 3! Error: TfliteModule.createModel(...):
Failed to create TFLite interpreter!
```

and - the tell - **no `tflite` line at all** in logcat, where the other models
each log `Replacing N out of N node(s) with delegate`. The failure is at
interpreter construction, before the delegate ever reports a partition.

The cause is the graph. Despite the name, this arcface export is a **Vision
Transformer**, not a ResNet:

| count | op |
|---|---|
| 72 | `BATCH_MATMUL` |
| 12 | `SOFTMAX` (one per attention block) |
| 37 / 37 / 36 | `SHAPE` / `GATHER` / `STRIDED_SLICE` |
| 2 | `FILL` |
| **1** | `CONV_2D` - the 8x8 patch embedding, `[192, 8, 8, 3]` |

The GPU delegate has no kernels for that dynamic-shape plumbing, and
`react-native-fast-tflite` surfaces a delegate that cannot partition as a hard
load failure rather than silently falling back to CPU.

This is a property of the model and the bundled delegate, not of the device -
the delegate ships inside the APK - so `DetectorScreen` and `EnrolFaceScreen`
both pass an empty delegate list for this one model rather than probing.

Note the op *versions* are not the problem: every opcode in every model here is
version 1, and `BATCH_MATMUL` also appears in the detector, which delegates
fine.

## Re-verifying after swapping a model

A `.tflite` file is a FlatBuffer that can carry a zipped `metadata.json` at its
tail. Pull it out:

```bash
unzip -p assets/models/widerfaceyolo26.tflite metadata.json
```

Three things are **mandatory** to re-check, because getting any of them wrong
produces no error, just silently wrong results:

1. **Input shape and dtype** → update `MODEL_SIZE`, `RESIZER_FORMAT` in
   `src/screens/DetectorScreen.tsx`, and `renderToInput` in
   `src/detection/modelInput.ts` (the gallery-scan path builds its own input,
   bypassing the resizer).
2. **Output channel count** → update `NUM_CLASSES` in
   `src/shared/constants.ts`. `parseDetections` derives the anchor count from
   it (`out.length / (NUM_CLASSES + 4)`), so a wrong value silently reads every
   box from the wrong offset. The current layout is locked in by
   `__tests__/parseDetections.test.js`, which asserts the channel count is 5.
3. **Label table** → `src/shared/labels.ts`. It now answers for exactly one
   class; a multi-class model needs the name table back.
