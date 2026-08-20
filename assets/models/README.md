# Models

One model, from Ultralytics:

| File | Job | Runs when |
|---|---|---|
| `widerfaceyolo26.tflite` | Face detection, single class | Every scan (2 passes) |

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
| Input | `[1, 3, 640, 640]` float32 **NCHW**, values 0..1 |
| Output | `[1, 5, 8400]` float32 |
| 5 channels | `cx, cy, w, h` + 1 face score (already sigmoid'd) |
| 8400 anchors | 80² + 40² + 20², one per stride level |
| Labels | one class, `face` = 0 |
| Offset buffers | 0 — see the trap below |

The input square is unchanged from the COCO detector, which is why swapping the
model needed no change to `MODEL_SIZE`, `RESIZER_FORMAT` or `renderToInput`.
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
