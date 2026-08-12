// Xác nhận bằng labelmap.txt trong metadata của model (bước 7 hướng dẫn):
// dòng đầu tiên là 'person' → index 0.
export const PERSON_CLASS_ID = 0;

// Kích thước input của model. EfficientDet-Lite2 dùng 448 (lite0 là 320).
// Xác nhận bằng model.inputs lúc chạy: shape [1, 448, 448, 3] uint8.
export const MODEL_SIZE = 448;

// Model tự giới hạn tối đa 25 detection mỗi lần (shape output [1, 25, 4]).
// Đây là trần CỦA MỘT LƯỢT, không phải của một lần quét: quét chạy hai lượt
// nên trần thực tế sau khi gộp là 50.
export const MAX_DETECTIONS = 25;

// Ngưỡng mặc định, áp chung cho mọi class. Đã thử hạ riêng cho class không phải
// 'person' rồi bỏ: thanh trượt ghi 90% mà vật thể 73% vẫn hiện là nói dối.
// 0.5 chứ không phải 0.6 như hồi chỉ đếm người - 0.6 chọn riêng cho 'person'.
export const SCORE_THRESHOLD = 0.5;

// Sàn cứng lúc đọc output, chỉ để cắt rác. Lọc thật do JS lo nên sàn phải thấp
// hơn mức nhỏ nhất thanh trượt đặt được (0.2).
export const RAW_SCORE_FLOOR = 0.05;

// Hai lượt quét cùng nhìn một cảnh nên vật thể giữa khung hay bị bắt hai lần.
// Chồng quá mức này thì coi là một, giữ bản điểm cao hơn.
export const NMS_IOU = 0.55;
