// The only class this model has. Kept as a named constant rather than a bare
// 0 because parseDetections still reads a class channel out of the output -
// the model is single-class, not class-free.
export const FACE_CLASS_ID = 0;

// Input size, confirmed against the input tensor shape of
// widerfaceyolo26.tflite: [1, 3, 640, 640] float32 - NCHW, hence pixelLayout
// 'planar'. Same square as the COCO detector this replaced, so the resizers
// and modelInput need no change.
export const MODEL_SIZE = 640;

// The model's class count. Get this wrong and every box/score split in the
// output lands in the wrong place. 1 here, not 80: the output tensor is
// [1, 5, 8400] - 4 box coordinates plus a single face score.
export const NUM_CLASSES = 1;

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
