# Models

Two models, both from Ultralytics:

| File | Job | Runs when |
|---|---|---|
| `yolo26n.tflite` | Object detection, COCO 80 classes | Every scan (2 passes) |
| `yolo26n-cls.tflite` | Fine-grained classification, 1000 ImageNet classes | On tapping a box |

Both are self-exported with Ultralytics 8.4.118 (the litert-torch path,
recognizable by the `serving_default_*` tensor names), so both take **NCHW** —
`renderToInput` in `src/detection/modelInput.ts` builds pixel input for both
from one function.

> **Pixel layout depends on the EXPORT PATH, not on the model.** The ready-made
> downloads on the Ultralytics site go through the older ONNX→TF path and come
> out **NHWC** (`[1, 640, 640, 3]`, tensor names `images`/`Identity`). Feed a
> model the wrong layout and it still runs and still returns numbers — just
> meaningless ones, with no error. Check the shape first, then adjust
> `RESIZER_FORMAT.pixelLayout` and the pixel loop in `renderToInput` to match.

> **ImageNet-1k has no "person" class.** Classifying a person crop can only ever
> return a garment or a backdrop, at very low confidence (measured: "sarong" at
> 6%). `DetectorScreen` therefore skips the `person` class outright, and
> `classify.ts` drops anything under `MIN_REFINED_SCORE`.

## Object detection — `yolo26n.tflite`

> **License: AGPL-3.0.** Ultralytics models carry an AGPL obligation — review
> the terms (or get a commercial license) before shipping a closed-source build.
> https://ultralytics.com/license

## Verified tensor layout

Read straight from the `.tflite` file (FlatBuffer) and the `metadata.json`
embedded in it — not guessed:

| | |
|---|---|
| Input | `[1, 3, 640, 640]` float32 **NCHW**, values 0..1 |
| Output | `[1, 84, 8400]` float32 |
| 84 channels | `cx, cy, w, h` + 80 class scores (already sigmoid'd) |
| 8400 anchors | 80² + 40² + 20², one per stride level |
| Labels | 80 contiguous COCO classes, `person` = 0 |

Output is **channel-major**: the value for channel `c` at anchor `a` sits at
`c * 8400 + a`, NOT `a * 84 + c`. Coordinates are already normalized to 0..1
(the graph is wrapped in `ultralytics.utils.export.engine._NormalizeCoords`).

`metadata.json` says **`end2end: false`**: there is no NMS in the graph, so the
app filters it itself via `mergeDetections()`. That's a deliberate choice — the
end2end variant returns a pre-filtered `[1, 300, 6]`, which is leaner but bakes
in a confidence cutoff Ultralytics fixed at export time, making the app's
threshold slider a no-op past that point. Measured on the same photo: the
end2end export dropped a 64%-confidence boat that dragging the slider down
could not bring back.

The two output formats have nothing in common, and getting it wrong produces no
error. Check the shape first, then update `parseDetections`; the current format
is locked in by `__tests__/parseDetections.test.js`.

## Fine-grained classification — `yolo26n-cls.tflite`

| | |
|---|---|
| Input | `[1, 3, 224, 224]` float32 **NCHW**, values 0..1 |
| Output | `[1, 1000]` float32, already through softmax (graph has a SOFTMAX op) |
| Labels | 1000 ImageNet classes, generated into `src/detection/imagenetLabels.ts` |

`224` on purpose, not the detector's `640`: this model's input is an
already-cropped box, and its only job is naming what was found, not finding it.
That's under 1/8th the pixels of a 640 export — the difference between a ~126ms
synchronous input build (has to be deferred off the render path) and one that
fits inside a single frame. `CLASSIFY_SIZE` in `src/shared/constants.ts` must
match whatever `imgsz` the model was actually exported with.

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
python3 tools/inspect_tflite.py assets/models/yolo26n.tflite
```

It prints the input/output shapes and the offset-buffer count. Anything other
than 0 means the file won't run.

## Re-verifying after swapping a model

A `.tflite` file is a FlatBuffer that can carry a zipped `metadata.json` at its
tail. Pull it out:

```bash
unzip -p assets/models/yolo26n.tflite metadata.json
```

Shape and dtype need the FlatBuffer itself — the fastest way is logging
`model.inputs` / `model.outputs` on a real device.

Three things are **mandatory** to re-check, because getting any of them wrong
produces no error, just silently wrong results:

1. **Input shape and dtype** → update `MODEL_SIZE`, `RESIZER_FORMAT` in
   `src/screens/DetectorScreen.tsx`, and `renderToInput` in
   `src/detection/modelInput.ts` (the gallery-scan path builds its own input,
   bypassing the resizer).
2. **Output layout** → update `parseDetections` in `src/detection/runModel.ts`.
   The current layout is locked in by `__tests__/parseDetections.test.js`.
3. **Label table** → `src/shared/labels.ts`. COCO has two conventions in the wild: 80
   contiguous classes (YOLO) and 91 with gaps (EfficientDet). Using the wrong
   one silently mislabels every class except `person`, with the app running
   exactly as normal.
