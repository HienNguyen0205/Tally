// The only class this model has. Kept as a named constant rather than a bare
// 0 because parseDetections still reads a class channel out of the output -
// the model is single-class, not class-free.
export const FACE_CLASS_ID = 0;

// Input size, read off widerfaceyolo26.tflite with tools/inspect_tflite.py:
// [1, 3, 320, 320] float32 - NCHW, hence pixelLayout 'planar'.
//
// This number and the model file have to agree, and NOTHING checks that they
// do. The file was swapped for a 320 export while this still said 640: the
// resizer went on producing 1,228,800 floats for a model that wanted 307,200,
// TFLite accepted the oversized buffer without a word, read the first quarter
// of it - the red plane, near enough - and returned no detections at all. A
// face filling the frame read as zero, with no error anywhere.
//
// If detections stop entirely, check the tensor shape before anything else.
export const MODEL_SIZE = 320;

// The model's class count. Get this wrong and every box/score split in the
// output lands in the wrong place. 1 here, not 80: the output tensor is
// [1, 5, 8400] - 4 box coordinates plus a single face score.
export const NUM_CLASSES = 1;

// FaceMesh's input square, from face_landmark_detector.tflite:
// [1, 192, 192, 3] float32 NHWC, 0..1. Its 468 landmarks come back in pixels
// of this same square, which is what normalises them. NHWC, unlike the
// detector - see modelInput.ts.
export const MESH_SIZE = 192;

// How large a face crop is encoded before being sent to the embedding server.
//
// Bigger than ArcFace's own 112 square on purpose: the server warps the crop
// onto its alignment template, and giving it roughly twice the pixels it needs
// means that warp resamples rather than invents. Costs a few KB of JPEG.
export const SEND_CROP_SIZE = 224;

// How much wider than the detector's box a face crop is taken.
// 1.25 rather than 1.0 because the detector boxes a face tightly while ArcFace
// was trained on crops carrying some forehead and chin; the bare box narrows
// the margin between "same person" and "stranger".
export const FACE_CROP_MARGIN = 1.25;

// YOLO26 is exported with end2end=false: NMS is NOT in the graph, the output is
// 8400 raw anchors. So this ceiling is our choice, not the model's limit - keep
// this many top-scoring boxes per pass before running NMS.
export const MAX_DETECTIONS = 100;

// Default confidence threshold.
export const SCORE_THRESHOLD = 0.5;

// Hard floor while reading the output, purely to cut noise. Real filtering
// happens in JS, so this must sit below the lowest the slider can go (0.2).
export const RAW_SCORE_FLOOR = 0.05;

// Both passes look at the same scene, so a face mid-frame tends to get caught
// twice. Overlap beyond this counts as one, keeping the higher score.
export const NMS_IOU = 0.55;
