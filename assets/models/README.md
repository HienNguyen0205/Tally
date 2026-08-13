# Model

Hai model, cả hai đều của Ultralytics:

| File | Việc | Chạy khi nào |
|---|---|---|
| `yolo26n.tflite` | Phát hiện vật thể, COCO 80 class | Mỗi lần quét (2 lượt) |
| `yolo26n-cls.tflite` | Phân loại chi tiết, 1000 class ImageNet | Khi chạm vào một box |

Cả hai cùng tự export bằng Ultralytics 8.4.118 (đường litert-torch, nhận biết
qua tên tensor `serving_default_*`) nên cùng nhận **NCHW** - `renderToInput`
trong `src/modelInput.ts` dựng pixel dùng chung cho cả hai.

> **Bố cục pixel phụ thuộc ĐƯỜNG EXPORT, không phụ thuộc model.** Bản tải sẵn
> trên trang Ultralytics đi đường ONNX→TF cũ và cho ra **NHWC**
> (`[1, 640, 640, 3]`, tên tensor `images`/`Identity`). Đưa nhầm bố cục thì
> model vẫn chạy và vẫn trả về số, chỉ toàn là rác - không có lỗi nào báo.
> Kiểm shape trước, rồi chỉnh `RESIZER_FORMAT.pixelLayout` và vòng lặp pixel
> trong `renderToInput` cho khớp.

> **ImageNet-1k không có class nào là người.** Crop người luôn ra tên một món
> quần áo với điểm rất thấp (đo được: "sarong" 6%). `DetectorScreen` vì thế bỏ
> qua hẳn class `person`, và `classify.ts` chặn mọi kết quả dưới
> `MIN_REFINED_SCORE`.

## Phát hiện vật thể — `yolo26n.tflite`

> **Giấy phép: AGPL-3.0.** Model Ultralytics ràng buộc AGPL - nếu phát hành app
> đóng thì phải xem lại điều khoản hoặc mua giấy phép thương mại.
> https://ultralytics.com/license

## Thông số đã xác minh

Đọc thẳng từ file `.tflite` (FlatBuffer) và `metadata.json` bên trong nó, không
phải suy đoán:

| | |
|---|---|
| Input | `[1, 3, 640, 640]` float32 **NCHW**, giá trị 0..1 |
| Output | `[1, 84, 8400]` float32 |
| 84 kênh | `cx, cy, w, h` + 80 điểm class (đã qua sigmoid) |
| 8400 anchor | 80² + 40² + 20² của ba tầng stride |
| Nhãn | 80 class COCO liên tục, `person` = 0 |

Output xếp **theo kênh**: giá trị kênh `c` tại anchor `a` nằm ở `c * 8400 + a`,
KHÔNG phải `a * 84 + c`. Toạ độ đã chuẩn hoá 0..1 (graph bọc trong
`ultralytics.utils.export.engine._NormalizeCoords`).

`metadata.json` ghi **`end2end: false`**: NMS không nằm trong graph, app tự lọc
bằng `mergeDetections()`. Đây là lựa chọn có chủ đích - bản end2end trả về
`[1, 300, 6]` đã lọc sẵn, gọn hơn nhưng ngưỡng do Ultralytics chốt cứng lúc
export nên thanh trượt ngưỡng của app mất tác dụng. Đo trên cùng một ảnh: bản
end2end bỏ mất con thuyền 64% mà kéo thanh trượt xuống cũng không lấy lại được.

Hai định dạng output không liên quan gì nhau, mà nhầm thì không có lỗi nào báo.
Kiểm shape trước, rồi sửa `parseDetections`; test trong
`__tests__/parseDetections.test.js` khoá định dạng hiện tại.

## Phân loại chi tiết — `yolo26n-cls.tflite`

| | |
|---|---|
| Input | `[1, 3, 640, 640]` float32 **NCHW**, giá trị 0..1 |
| Output | `[1, 1000]` float32, đã qua softmax (graph có op SOFTMAX) |
| Nhãn | 1000 class ImageNet, sinh sẵn ra `src/imagenetLabels.ts` |

Bản export này để `imgsz` 640 chứ không phải 224 như mặc định của Ultralytics -
`CLASSIFY_SIZE` phải khớp theo.

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
