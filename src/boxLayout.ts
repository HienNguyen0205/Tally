export interface NormalizedBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Ô vuông mà resizer đã ép khung hình vào trước khi đưa cho model.
 *
 * - `'contain'` (letterbox): cạnh = cạnh DÀI của frame, phần thừa là viền đen.
 *   Giữ trọn khung hình.
 * - `'cover'`: cạnh = cạnh NGẮN, cắt bớt hai đầu cạnh dài. Mất rìa nhưng phần
 *   giữa được dùng trọn cạnh ô vuông nên vật thể nhỏ rõ hơn hẳn.
 */
export type ScanSpace = 'contain' | 'cover';

/**
 * Quy box từ ô vuông của model về hệ chuẩn hoá của FRAME (0..1).
 *
 * Hai lượt quét dùng hai ô vuông khác nhau nên phải quy về cùng một hệ ngay
 * tại đây - trước khi gộp, đo diện tích hay tính vùng chạm. Offset âm
 * (`'contain'`) là viền đen phải trừ, offset dương (`'cover'`) là phần khung
 * đã bị cắt phải cộng lại.
 */
export function toFrameBox(
  box: NormalizedBox,
  space: ScanSpace,
  frameW: number,
  frameH: number,
): NormalizedBox {
  const boxSize =
    space === 'contain'
      ? Math.max(frameW, frameH)
      : Math.min(frameW, frameH);
  const offX = (frameW - boxSize) / 2;
  const offY = (frameH - boxSize) / 2;

  return {
    xmin: (offX + box.xmin * boxSize) / frameW,
    ymin: (offY + box.ymin * boxSize) / frameH,
    xmax: (offX + box.xmax * boxSize) / frameW,
    ymax: (offY + box.ymax * boxSize) / frameH,
  };
}

/**
 * Ô mà một ảnh phải được vẽ vào, bên trong ô vuông cạnh `modelSize` của model.
 *
 * Dùng cho đường quét ảnh có sẵn, nơi phải tự dựng input bằng Skia vì resizer
 * chỉ nhận Frame. Là mặt trái của {@link toFrameBox} và phải khớp chính xác
 * cùng quy ước ô vuông - lệch là box sai mà không có lỗi nào báo, nên nó nằm
 * cạnh đây và có test đối chiếu.
 */
export function modelDestRect(
  imageW: number,
  imageH: number,
  space: ScanSpace,
  modelSize: number,
): ScreenRect {
  const boxSize =
    space === 'contain' ? Math.max(imageW, imageH) : Math.min(imageW, imageH);
  const scale = modelSize / boxSize;
  const width = imageW * scale;
  const height = imageH * scale;

  return {
    left: (modelSize - width) / 2,
    top: (modelSize - height) / 2,
    width,
    height,
  };
}

/**
 * Quy box (đã ở hệ frame, xem {@link toFrameBox}) về pixel của một bề mặt vẽ -
 * màn hình hoặc ảnh chụp.
 *
 * Canvas của SkiaCamera vẽ ảnh với fit="cover": phóng theo cạnh nào thiếu rồi
 * cắt bớt cạnh thừa, nên phải dùng max() và bù phần bị cắt.
 */
export function boxToScreen(
  box: NormalizedBox,
  frameW: number,
  frameH: number,
  screenW: number,
  screenH: number,
): ScreenRect {
  const scale = Math.max(screenW / frameW, screenH / frameH);
  const cropX = (screenW - frameW * scale) / 2;
  const cropY = (screenH - frameH * scale) / 2;

  return {
    left: cropX + box.xmin * frameW * scale,
    top: cropY + box.ymin * frameH * scale,
    width: (box.xmax - box.xmin) * frameW * scale,
    height: (box.ymax - box.ymin) * frameH * scale,
  };
}
