const { modelDestRect, toFrameBox } = require('../src/shared/boxLayout');

/**
 * Kiểm tra phép quy toạ độ box từ ô vuông của model về hệ khung hình.
 * Lệch vài chục pixel rất khó phát hiện bằng mắt trên máy thật nên kiểm bằng số.
 *
 * Hai lượt quét dùng hai ô vuông khác nhau ('contain' giữ trọn khung + viền
 * đen, 'cover' cắt lấy ô vuông giữa) nên đây là chỗ duy nhất biết sự khác biệt
 * đó - sai ở đây thì mọi thứ phía sau lệch theo mà không có lỗi nào báo.
 */
// Điểm giữa của box, tính trong hệ frame (0..1).
function centerOf(box) {
  return { x: (box.xmin + box.xmax) / 2, y: (box.ymin + box.ymax) / 2 };
}

// Box suy biến thành một điểm, để kiểm phép map từng điểm.
function point(x, y) {
  return { xmin: x, ymin: y, xmax: x, ymax: y };
}

describe("quy box về hệ frame - 'contain' (letterbox)", () => {
  // Frame dọc mặc định của app: 720x1280 (HD_16_9 sau khi xoay đứng).
  const W = 720;
  const H = 1280;
  // Viền đen mỗi bên trái/phải: (1280-720)/2 = 280px → chuẩn hoá 280/1280.
  const padX = (H - W) / 2 / H;

  it('tâm ô vuông rơi đúng tâm khung hình', () => {
    const c = centerOf(toFrameBox(point(0.5, 0.5), 'contain', W, H));
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });

  it('bù đúng viền đen ở hai mép trái/phải', () => {
    expect(centerOf(toFrameBox(point(padX, 0.5), 'contain', W, H)).x).toBeCloseTo(0);
    expect(
      centerOf(toFrameBox(point(1 - padX, 0.5), 'contain', W, H)).x,
    ).toBeCloseTo(1);
  });

  // Điểm mấu chốt: 'cover' một mình trước đây cắt mất hoàn toàn đỉnh và đáy.
  it('phủ tới tận đỉnh và đáy khung hình', () => {
    expect(centerOf(toFrameBox(point(0.5, 0), 'contain', W, H)).y).toBeCloseTo(0);
    expect(centerOf(toFrameBox(point(0.5, 1), 'contain', W, H)).y).toBeCloseTo(1);
  });

  it('đúng cả khi xoay ngang', () => {
    const c = centerOf(
      toFrameBox(point(0.5, (1280 - 720) / 2 / 1280), 'contain', 1280, 720),
    );
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0);
  });
});

describe("quy box về hệ frame - 'cover' (cắt ô vuông giữa)", () => {
  const W = 720;
  const H = 1280;
  // Ô vuông cạnh 720 đặt giữa khung cao 1280 → cắt mất (1280-720)/2 = 280px
  // mỗi đầu, tức 280/1280 của chiều cao.
  const cropY = (H - W) / 2 / H;

  it('tâm ô vuông vẫn rơi đúng tâm khung hình', () => {
    const c = centerOf(toFrameBox(point(0.5, 0.5), 'cover', W, H));
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
  });

  it('bề ngang dùng trọn khung, không có viền', () => {
    expect(centerOf(toFrameBox(point(0, 0.5), 'cover', W, H)).x).toBeCloseTo(0);
    expect(centerOf(toFrameBox(point(1, 0.5), 'cover', W, H)).x).toBeCloseTo(1);
  });

  it('đỉnh ô vuông nằm hẳn trong khung - phần bị cắt phải cộng lại', () => {
    expect(centerOf(toFrameBox(point(0.5, 0), 'cover', W, H)).y).toBeCloseTo(cropY);
    expect(centerOf(toFrameBox(point(0.5, 1), 'cover', W, H)).y).toBeCloseTo(
      1 - cropY,
    );
  });

  it('cùng một vật thể ở giữa khung thì hai lượt cho ra cùng một chỗ', () => {
    // Vật thể chiếm nửa ô vuông 'cover' → trong hệ frame nó phải trùng với box
    // tương ứng của lượt 'contain'. Đây chính là điều kiện để NMS gộp được.
    const tight = toFrameBox(
      { xmin: 0.25, ymin: 0.25, xmax: 0.75, ymax: 0.75 },
      'cover',
      W,
      H,
    );
    // Cùng vùng đó nhìn từ ô vuông 'contain': cạnh 1280, tâm trùng tâm frame.
    // Vật thể là hình vuông cạnh W/2 = 360px, quy theo cạnh ô vuông 1280.
    const side = W / 2 / H;
    const wide = toFrameBox(
      {
        xmin: 0.5 - side / 2,
        ymin: 0.5 - side / 2,
        xmax: 0.5 + side / 2,
        ymax: 0.5 + side / 2,
      },
      'contain',
      W,
      H,
    );

    expect(tight.xmin).toBeCloseTo(wide.xmin, 5);
    expect(tight.ymin).toBeCloseTo(wide.ymin, 5);
    expect(tight.xmax).toBeCloseTo(wide.xmax, 5);
    expect(tight.ymax).toBeCloseTo(wide.ymax, 5);
  });
});

/**
 * Đường quét ảnh có sẵn tự dựng input bằng Skia thay vì dùng resizer, nên phép
 * đặt ảnh vào ô vuông model phải khớp CHÍNH XÁC quy ước mà toFrameBox giả định.
 * Lệch ở đây thì box trên ảnh thư viện sai hệ thống mà không có lỗi nào báo.
 */
describe('modelDestRect khớp với toFrameBox', () => {
  const SIZE = 448;

  // Điểm chuẩn hoá trong ô vuông model → pixel ảnh, suy ngược từ ô đích.
  function pixelFromDest(dest, u, imageSize, axis) {
    const offset = axis === 'x' ? dest.left : dest.top;
    const drawn = axis === 'x' ? dest.width : dest.height;
    return ((u * SIZE - offset) * imageSize) / drawn;
  }

  for (const space of ['contain', 'cover']) {
    for (const [W, H] of [
      [720, 1280],
      [1280, 720],
      [1000, 1000],
      [4032, 3024],
    ]) {
      it(`'${space}' ${W}x${H}: hai phép tính chỉ về cùng một pixel`, () => {
        const dest = modelDestRect(W, H, space, SIZE);

        for (const u of [0, 0.25, 0.5, 0.9, 1]) {
          const viaFrameBox = toFrameBox(
            { xmin: u, ymin: u, xmax: u, ymax: u },
            space,
            W,
            H,
          );
          expect(pixelFromDest(dest, u, W, 'x')).toBeCloseTo(viaFrameBox.xmin * W, 4);
          expect(pixelFromDest(dest, u, H, 'y')).toBeCloseTo(viaFrameBox.ymin * H, 4);
        }
      });
    }
  }
});
