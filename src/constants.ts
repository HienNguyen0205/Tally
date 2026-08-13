// Nhãn đầu tiên trong metadata.json của model là 'person'.
export const PERSON_CLASS_ID = 0;

// Kích thước input, đọc từ metadata (imgsz) và xác nhận bằng shape tensor vào:
// [1, 3, 640, 640] float32 - NCHW nên resizer phải để pixelLayout 'planar'.
export const MODEL_SIZE = 640;

// Số class của model. Sai số này thì việc tách box/score trong output lệch hết.
export const NUM_CLASSES = 80;

// YOLO26 xuất với end2end=false: NMS KHÔNG nằm trong graph, output là 8400
// anchor thô. Nên trần này là lựa chọn của ta, không phải giới hạn của model -
// giữ lại bấy nhiêu box điểm cao nhất mỗi lượt trước khi chạy NMS.
export const MAX_DETECTIONS = 100;

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
