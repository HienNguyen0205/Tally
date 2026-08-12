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

// Ngưỡng mặc định, áp CHUNG cho mọi class.
//
// Đã thử hạ riêng ngưỡng cho các class không phải 'person' (chúng ghi điểm thấp
// hơn hẳn ở cùng chất lượng phát hiện) nhưng bỏ đi: thanh trượt ghi 90% mà vật
// thể 73% vẫn hiện thì con số trên màn hình thành nói dối. Một núm thì phải chỉ
// có một nghĩa - thấy sót vật thể thì kéo thanh xuống, đúng việc của nó.
//
// 0.5 thay vì 0.6 như hồi chỉ đếm người: 0.6 vốn chọn riêng cho 'person', để
// nguyên thì các class khác bị vứt oan ngay từ mặc định.
export const SCORE_THRESHOLD = 0.5;

// Sàn cứng lúc đọc output. Việc lọc thật do JS lo để thanh ngưỡng đổi được ngay
// trên ảnh đã chụp, nên sàn này chỉ để cắt rác - phải thấp hơn mức nhỏ nhất mà
// thanh trượt có thể đặt (0.2).
export const RAW_SCORE_FLOOR = 0.05;

// Hai lượt quét nhìn cùng một cảnh nên vật thể ở giữa khung thường bị bắt hai
// lần. Trên ngưỡng chồng lấn này thì coi là một, giữ lại bản điểm cao hơn.
export const NMS_IOU = 0.55;
