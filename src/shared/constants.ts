// The first label in the model's metadata.json is 'person'.
export const PERSON_CLASS_ID = 0;

// Input size, read from the metadata (imgsz) and confirmed against the input
// tensor shape: [1, 3, 640, 640] float32 - NCHW, hence pixelLayout 'planar'.
export const MODEL_SIZE = 640;

// The model's class count. Get this wrong and every box/score split in the
// output lands in the wrong place.
export const NUM_CLASSES = 80;

// The classifier's square (yolo26n-cls, `imgsz` in its own metadata). 224
// rather than the detector's 640: the input here is an already-cropped box and
// the model only has to name it, not go looking. Eight times fewer pixels.
export const CLASSIFY_SIZE = 224;

// Below this the model is guessing - better no refined name than a wrong one.
// Measured on device: a person crop returns "sarong 6%", a boat crop returns
// the right name with a far higher score.
export const MIN_REFINED_SCORE = 0.2;

// YOLO26 is exported with end2end=false: NMS is NOT in the graph, the output is
// 8400 raw anchors. So this ceiling is our choice, not the model's limit - keep
// this many top-scoring boxes per pass before running NMS.
export const MAX_DETECTIONS = 100;

// Default threshold, shared by every class. A separate lower threshold for
// non-person classes was tried and dropped: a slider reading 90% while a 73%
// object is still on screen is a lie. 0.5 rather than the 0.6 used back when
// this only counted people - that 0.6 was chosen for 'person' specifically.
export const SCORE_THRESHOLD = 0.5;

// Hard floor while reading the output, purely to cut noise. Real filtering
// happens in JS, so this must sit below the lowest the slider can go (0.2).
export const RAW_SCORE_FLOOR = 0.05;

// Both passes look at the same scene, so an object mid-frame tends to get
// caught twice. Overlap beyond this counts as one, keeping the higher score.
export const NMS_IOU = 0.55;
