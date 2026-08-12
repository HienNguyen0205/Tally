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
 * - `'contain'` (letterbox): cạnh ô vuông = cạnh DÀI của frame, phần thừa là
 *   viền đen. Giữ trọn khung hình.
 * - `'cover'`: cạnh ô vuông = cạnh NGẮN, cắt bớt hai đầu cạnh dài. Mất rìa
 *   nhưng phần giữa được dùng trọn 448px nên vật thể nhỏ rõ hơn hẳn.
 */
export type ScanSpace = 'contain' | 'cover';

/**
 * Quy box từ ô vuông của model về hệ chuẩn hoá của FRAME (0..1).
 *
 * Model luôn trả toạ độ trong ô vuông nó nhìn thấy, không phải trong khung
 * hình. Hai lượt quét dùng hai ô vuông khác nhau nên phải quy về cùng một hệ
 * ngay tại đây - trước khi gộp, đo diện tích hay tính vùng chạm.
 *
 * Offset âm (`'contain'`) chính là viền đen phải trừ đi; offset dương
 * (`'cover'`) là phần khung hình đã bị cắt phải cộng lại.
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
 * Dùng cho đường quét ảnh có sẵn: ảnh trong thư viện không phải Frame nên
 * resizer không nhận, phải tự dựng input bằng Skia. Phép tính này là mặt trái
 * của {@link toFrameBox} và phải khớp chính xác cùng một quy ước ô vuông - lệch
 * là box sai mà không có lỗi nào báo, nên nó đứng riêng ở đây và có test.
 *
 * 'contain' thu cả ảnh vào trong ô (phần thừa để đen), 'cover' phóng cho tràn ô
 * rồi bị cắt - đúng hai chế độ của resizer.
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
