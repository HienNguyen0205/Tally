# Model

Đang dùng: `yolo26n.tflite` (Ultralytics YOLO26n, COCO 80 class).

> **Giấy phép: AGPL-3.0.** Model Ultralytics ràng buộc AGPL - nếu phát hành app
> đóng thì phải xem lại điều khoản hoặc mua giấy phép thương mại.
> https://ultralytics.com/license

## Thông số đã xác minh

Đọc thẳng từ file `.tflite` (FlatBuffer) và `metadata.json` bên trong nó, không
phải suy đoán:

| | |
|---|---|
| Input | `[1, 3, 640, 640]` **float32**, giá trị 0..1 |
| Output | `[1, 84, 8400]` float32 |
| 84 kênh | `cx, cy, w, h` + 80 điểm class |
| 8400 anchor | 80² + 40² + 20² (ba tầng stride 8/16/32) |
| Nhãn | 80 class COCO liên tục, `person` = 0 |

Ba điểm dễ sai nhất, đều đã kiểm bằng file:

1. **Tên file ghi `int8` nhưng hai đầu là float32.** Lượng tử hoá nằm bên
   trong; tensor vào/ra đã được bọc quant/dequant. Nên resizer để `float32`.
2. **Input là NCHW** (`[1, 3, 640, 640]`, kênh đứng trước) chứ không phải NHWC
   như EfficientDet → `pixelLayout: 'planar'`.
3. **Output xếp theo kênh**: giá trị kênh `c` tại anchor `a` nằm ở
   `c * 8400 + a`, KHÔNG phải `a * 84 + c`.

Toạ độ đã chuẩn hoá sẵn về 0..1 - graph được bọc trong
`ultralytics.utils.export.engine._NormalizeCoords`. Điểm class đã qua sigmoid.

`metadata.json` ghi `end2end: false`: **NMS không nằm trong graph**. App tự lọc
bằng `mergeDetections()` trong `src/detections.ts`, nên `MAX_DETECTIONS` là lựa
chọn của ta chứ không còn là trần cứng của model như bản EfficientDet trước.

## Bẫy: buffer ngoài flatbuffer

Runtime đi kèm `react-native-fast-tflite` là `com.google.ai.edge.litert:litert:1.4.0`,
và nó **không phân giải được buffer kiểu offset**. Schema TFLite cho phép một
buffer bỏ trống trường `data` rồi ghi `offset`/`size` trỏ tới vị trí byte khác
trong file - bộ lượng tử hoá của `ai_edge_litert` xuất ra đúng kiểu này.

Triệu chứng: model **nạp được**, mọi shape đều khớp, nhưng `runSync` ném
`Failed to run TFLite Model! Status: error`, và logcat có dòng:

```
E tflite : Input tensor <n> lacks data
```

Tensor đó là trọng số của một lớp Conv. Không có cách nào chữa từ phía app -
phải export lại cho trọng số nằm trong flatbuffer.

Kiểm nhanh một file bất kỳ, không cần cài tensorflow:

```bash
python3 tools/inspect_tflite.py assets/models/yolo26n.tflite
```

Nó in luôn shape tensor vào-ra và số buffer offset. Khác 0 là file không chạy được.

## Đọc lại thông số khi đổi model

`.tflite` là FlatBuffer có thể kèm zip metadata ở cuối. Lấy metadata:

```bash
unzip -p assets/models/yolo26n.tflite metadata.json
```

Shape và kiểu tensor thì phải đọc FlatBuffer. Cách nhanh nhất là log
`model.inputs` / `model.outputs` lúc chạy trên máy thật.

Ba thứ **bắt buộc** kiểm lại, vì sai thì không có lỗi nào báo mà kết quả cứ
lệch âm thầm:

1. **Shape và kiểu input** → sửa `MODEL_SIZE`, `RESIZER_FORMAT` trong
   `src/screens/DetectorScreen.tsx`, và hàm `toModelInput` trong
   `src/scanImage.ts` (đường quét ảnh thư viện tự dựng input, không qua resizer).
2. **Bố cục output** → sửa `parseDetections` trong `src/runModel.ts`.
   Có test khoá bố cục hiện tại ở `__tests__/parseDetections.test.js`.
3. **Bảng nhãn** → `src/labels.ts`. COCO có hai quy ước: 80 class liên tục
   (YOLO) và 91 class có ô trống (EfficientDet). Dùng nhầm bảng thì mọi class
   trừ `person` đều sai tên mà app vẫn chạy bình thường.
