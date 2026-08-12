// Xác nhận bằng labelmap.txt trong metadata của model (bước 7 hướng dẫn):
// dòng đầu tiên là 'person' → index 0.
export const PERSON_CLASS_ID = 0;

// Kích thước input của model. EfficientDet-Lite2 dùng 448 (lite0 là 320).
// Xác nhận bằng model.inputs lúc chạy: shape [1, 448, 448, 3] uint8.
export const MODEL_SIZE = 448;

// Model tự giới hạn tối đa 25 detection mỗi lần (shape output [1, 25, 4]).
export const MAX_DETECTIONS = 25;

// Chỉ nhận detection có độ tin cậy cao, lọc sạch nhiễu.
// Ngưỡng này chọn cho class "person" vốn rất đáng tin; các class khác thường
// có score thấp hơn nên nếu thấy sót vật thể thì hạ xuống ~0.4.
export const SCORE_THRESHOLD = 0.6;
