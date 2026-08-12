# Model

Đang dùng: `efficientdet_lite2.tflite` (COCO 2017, 90 class).

Tải tại https://www.kaggle.com/models/tensorflow/efficientdet →
Framework `tfLite`, Variation `lite2-detection-metadata`.

## Thông số đã xác minh trên máy thật

Đọc bằng `model.inputs` / `model.outputs` lúc chạy, không phải suy đoán:

| | |
|---|---|
| Input | `[1, 448, 448, 3]` uint8 → `MODEL_SIZE = 448` |
| Output 0 | `[1, 25, 4]` boxes `[ymin, xmin, ymax, xmax]` chuẩn hoá |
| Output 1 | `[1, 25]` classes |
| Output 2 | `[1, 25]` scores |
| Output 3 | `[1]` số lượng phát hiện |
| Tối đa | 25 vật thể/lần → `MAX_DETECTIONS` |

Nhãn: dòng đầu `labelmap.txt` là `person` → `PERSON_CLASS_ID = 0`.

## Khi đổi sang model khác

Ba thứ **bắt buộc** kiểm lại, vì sai thì không có lỗi nào báo mà kết quả cứ
lệch âm thầm:

1. **Kích thước input** → sửa `MODEL_SIZE` trong `src/constants.ts`.
2. **Thứ tự tensor output** → tạm log `model.outputs` rồi đối chiếu với thứ tự
   đang đọc trong worklet của `DetectorScreen.tsx`.
3. **Label map** → giải nén metadata (file `.tflite` thực chất là zip) và xem
   `person` nằm ở index nào:

```bash
unzip -o efficientdet_lite2.tflite -d metadata_extract
head -5 metadata_extract/labelmap.txt
```
