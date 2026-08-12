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
 * Quy box từ hệ toạ độ của model về pixel màn hình, qua hai chặng:
 *
 * 1. Ô vuông letterbox → pixel frame.
 *    Resizer dùng scaleMode 'contain' nên khung hình được thu vừa vào ô vuông
 *    cạnh = cạnh dài của frame; offset âm chính là phần viền đen phải trừ.
 *
 * 2. Pixel frame → pixel màn hình.
 *    Canvas của SkiaCamera vẽ ảnh với fit="cover": phóng theo cạnh nào thiếu
 *    rồi cắt bớt cạnh thừa, nên phải dùng max() và bù phần bị cắt.
 */
export function boxToScreen(
  box: NormalizedBox,
  frameW: number,
  frameH: number,
  screenW: number,
  screenH: number,
): ScreenRect {
  // Chặng 1
  const boxSize = Math.max(frameW, frameH);
  const padX = (frameW - boxSize) / 2;
  const padY = (frameH - boxSize) / 2;

  const fx = padX + box.xmin * boxSize;
  const fy = padY + box.ymin * boxSize;
  const fw = (box.xmax - box.xmin) * boxSize;
  const fh = (box.ymax - box.ymin) * boxSize;

  // Chặng 2
  const scale = Math.max(screenW / frameW, screenH / frameH);
  const drawnW = frameW * scale;
  const drawnH = frameH * scale;
  const cropX = (screenW - drawnW) / 2;
  const cropY = (screenH - drawnH) / 2;

  return {
    left: cropX + fx * scale,
    top: cropY + fy * scale,
    width: fw * scale,
    height: fh * scale,
  };
}
