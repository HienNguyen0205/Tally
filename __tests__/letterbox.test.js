/**
 * Kiểm tra phép map toạ độ box từ ô vuông letterbox ('contain') về pixel frame.
 * Lệch vài chục pixel rất khó phát hiện bằng mắt trên máy thật nên kiểm bằng số.
 *
 * Công thức đang dùng trong worklet của DetectorScreen:
 *   boxSize = max(W, H); offset = (dim - boxSize) / 2   // offset âm = viền đen
 *   pixel   = offset + normalized * boxSize
 */
function mapPoint(W, H, norm) {
  const boxSize = Math.max(W, H);
  return {
    x: (W - boxSize) / 2 + norm.x * boxSize,
    y: (H - boxSize) / 2 + norm.y * boxSize,
  };
}

describe('map letterbox về toạ độ frame', () => {
  // Frame dọc mặc định của app: 720x1280 (HD_16_9 sau khi xoay đứng).
  const W = 720;
  const H = 1280;
  // Viền đen mỗi bên trái/phải: (1280-720)/2 = 280px → chuẩn hoá 280/1280.
  const padX = (H - W) / 2 / H;

  it('tâm ô vuông rơi đúng tâm khung hình', () => {
    const p = mapPoint(W, H, { x: 0.5, y: 0.5 });
    expect(p.x).toBeCloseTo(W / 2);
    expect(p.y).toBeCloseTo(H / 2);
  });

  it('bù đúng viền đen ở hai mép trái/phải', () => {
    expect(mapPoint(W, H, { x: padX, y: 0.5 }).x).toBeCloseTo(0);
    expect(mapPoint(W, H, { x: 1 - padX, y: 0.5 }).x).toBeCloseTo(W);
  });

  // Điểm mấu chốt: 'cover' trước đây cắt mất hoàn toàn đỉnh và đáy khung hình.
  it('phủ tới tận đỉnh và đáy khung hình', () => {
    expect(mapPoint(W, H, { x: 0.5, y: 0 }).y).toBeCloseTo(0);
    expect(mapPoint(W, H, { x: 0.5, y: 1 }).y).toBeCloseTo(H);
  });

  it('đúng cả khi xoay ngang', () => {
    const p = mapPoint(1280, 720, { x: 0.5, y: (1280 - 720) / 2 / 1280 });
    expect(p.x).toBeCloseTo(640);
    expect(p.y).toBeCloseTo(0);
  });
});
