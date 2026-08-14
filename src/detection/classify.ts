import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';

import { CLASSIFY_SIZE, MIN_REFINED_SCORE } from '../shared/constants';
import { modelDestRect, type ScreenRect } from '../shared/boxLayout';
import { renderToInput } from './modelInput';
import { IMAGENET_LABELS } from './imagenetLabels';

export interface Refined {
  label: string;
  score: number;
}

/**
 * Gọi tên chi tiết cho một vật thể đã phát hiện: COCO chỉ có 80 loại thô nên
 * mọi giống chó đều là "chó"; model phân loại có 1000 loại ImageNet.
 *
 * `rect` là vùng box tính bằng PIXEL CỦA `image` - dùng `boxToScreen` với kích
 * thước ảnh để quy từ hệ frame sang.
 *
 * Chạy `run` bất đồng bộ chứ không `runSync`: đây là JS thread, mà một lượt
 * suy luận 640² đủ lâu để làm khựng giao diện.
 */
export async function classifyCrop(
  model: TensorflowModel,
  image: SkImage,
  rect: ScreenRect,
): Promise<Refined | null> {
  // Giữ nguyên tỉ lệ vùng cắt (thừa ra thì để đen) thay vì bóp méo - vật thể
  // bị kéo giãn thì phân loại sai hẳn.
  //
  // Khối này ĐỒNG BỘ (Skia đọc pixel rồi tách kênh). Ở 224 nó gọn trong một
  // khung hình; hồi model còn để 640 thì tốn ~126ms và phải hoãn hẳn ra.
  const input = renderToInput(
    image,
    rect,
    modelDestRect(rect.width, rect.height, 'contain', CLASSIFY_SIZE),
    CLASSIFY_SIZE,
  );
  if (input == null) return null;

  const outputs = await model.run([input.buffer as ArrayBuffer]);
  const scores = new Float32Array(outputs[0]!);

  let best = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[best]!) best = i;
  }

  const label = IMAGENET_LABELS[best];
  // Graph có sẵn softmax nên điểm đã là xác suất 0..1.
  const score = scores[best]!;
  if (label == null || score < MIN_REFINED_SCORE) return null;
  return { label, score };
}
