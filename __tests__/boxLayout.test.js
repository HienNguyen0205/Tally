const { boxToScreen } = require('../src/boxLayout');

/**
 * Vùng chạm lệch so với box đã vẽ là lỗi rất khó thấy bằng mắt (bấm hụt vài
 * chục pixel), nên kiểm bằng số ở các mốc đặc trưng.
 */
describe('quy box về toạ độ màn hình', () => {
  // Frame dọc 720x1280, màn hình 1080x2460 - đúng cấu hình thật của máy test.
  const FW = 720;
  const FH = 1280;
  const SW = 1080;
  const SH = 2460;

  // Viền đen letterbox mỗi bên trái/phải, quy ra chuẩn hoá.
  const padX = (FH - FW) / 2 / FH;

  const full = { xmin: padX, ymin: 0, xmax: 1 - padX, ymax: 1 };

  it('box phủ trọn khung hình thì phủ trọn chiều cao màn hình', () => {
    const r = boxToScreen(full, FW, FH, SW, SH);
    // fit="cover": màn cao hơn tỉ lệ frame nên phóng theo chiều cao, cắt bớt ngang.
    expect(r.top).toBeCloseTo(0, 5);
    expect(r.height).toBeCloseTo(SH, 5);
    // Bề ngang bị tràn ra ngoài hai mép - đó chính là phần bị cắt.
    expect(r.left).toBeLessThan(0);
    expect(r.width).toBeGreaterThan(SW);
  });

  it('tâm box rơi đúng tâm màn hình', () => {
    const mid = { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.5 };
    const r = boxToScreen(mid, FW, FH, SW, SH);
    expect(r.left).toBeCloseTo(SW / 2, 5);
    expect(r.top).toBeCloseTo(SH / 2, 5);
  });

  it('giữ đúng tỉ lệ: box vuông trong frame ra hình vuông trên màn', () => {
    const half = { xmin: 0.3, ymin: 0.3, xmax: 0.5, ymax: 0.5 };
    const r = boxToScreen(half, FW, FH, SW, SH);
    expect(r.width).toBeCloseTo(r.height, 5);
  });

  it('đúng cả khi màn hình xoay ngang', () => {
    const mid = { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.5 };
    const r = boxToScreen(mid, 1280, 720, 2460, 1080);
    expect(r.left).toBeCloseTo(2460 / 2, 5);
    expect(r.top).toBeCloseTo(1080 / 2, 5);
  });
});
