const { parseDetections } = require('../src/runModel');
const {
  NUM_CLASSES,
  MAX_DETECTIONS,
  RAW_SCORE_FLOOR,
} = require('../src/constants');

const CHANNELS = NUM_CLASSES + 4;

/**
 * Dựng output giả đúng bố cục [1, 84, N] của bản export không end2end: xếp theo
 * KÊNH, nên giá trị kênh c tại anchor a nằm ở `c * N + a`.
 *
 * Đảo nhầm sang `a * 84 + c` là lỗi không có thông báo nào - box vẫn ra, chỉ ra
 * sai chỗ - nên phải khoá bằng test. Bản export CÓ end2end lại cho ra
 * `[1, 300, 6]` hoàn toàn khác; kiểm shape trước khi đổi model.
 */
function buildOutput(anchors, boxes) {
  const out = new Float32Array(CHANNELS * anchors);
  const put = (c, a, v) => {
    out[c * anchors + a] = v;
  };

  for (const { anchor, cx, cy, w, h, classId, score } of boxes) {
    put(0, anchor, cx);
    put(1, anchor, cy);
    put(2, anchor, w);
    put(3, anchor, h);
    put(4 + classId, anchor, score);
  }
  return [out.buffer];
}

describe('giải mã output anchor thô', () => {
  it('đọc đúng ô theo bố cục kênh và đổi tâm+kích thước thành hai góc', () => {
    const found = parseDetections(
      buildOutput(10, [
        { anchor: 5, cx: 0.5, cy: 0.4, w: 0.2, h: 0.6, classId: 3, score: 0.9 },
      ]),
    );

    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(3);
    expect(found[0].score).toBeCloseTo(0.9);
    expect(found[0].xmin).toBeCloseTo(0.4);
    expect(found[0].xmax).toBeCloseTo(0.6);
    expect(found[0].ymin).toBeCloseTo(0.1);
    expect(found[0].ymax).toBeCloseTo(0.7);
  });

  it('mỗi anchor chỉ giữ class điểm cao nhất', () => {
    const anchors = 4;
    const out = new Float32Array(CHANNELS * anchors);
    out[0 * anchors + 1] = 0.5; // cx
    out[1 * anchors + 1] = 0.5; // cy
    out[2 * anchors + 1] = 0.1; // w
    out[3 * anchors + 1] = 0.1; // h
    out[(4 + 7) * anchors + 1] = 0.4;
    out[(4 + 12) * anchors + 1] = 0.85; // class thắng
    out[(4 + 20) * anchors + 1] = 0.3;

    const found = parseDetections([out.buffer]);
    expect(found).toHaveLength(1);
    expect(found[0].classId).toBe(12);
    expect(found[0].score).toBeCloseTo(0.85);
  });

  it('bỏ anchor dưới sàn cứng', () => {
    const found = parseDetections(
      buildOutput(6, [
        {
          anchor: 2,
          cx: 0.5,
          cy: 0.5,
          w: 0.1,
          h: 0.1,
          classId: 1,
          score: RAW_SCORE_FLOOR / 2,
        },
      ]),
    );
    expect(found).toHaveLength(0);
  });

  it('trả về theo điểm giảm dần và cắt ở MAX_DETECTIONS', () => {
    const anchors = MAX_DETECTIONS + 30;
    const boxes = [];
    for (let a = 0; a < anchors; a++) {
      boxes.push({
        anchor: a,
        cx: 0.5,
        cy: 0.5,
        w: 0.05,
        h: 0.05,
        classId: a % NUM_CLASSES,
        // Anchor sau điểm cao hơn, để chắc chắn là có sắp xếp thật.
        score: 0.2 + (a / anchors) * 0.7,
      });
    }

    const found = parseDetections(buildOutput(anchors, boxes));
    expect(found).toHaveLength(MAX_DETECTIONS);
    expect(found[0].score).toBeGreaterThan(found[found.length - 1].score);
    // Cắt phải giữ lại nhóm điểm CAO nhất chứ không phải nhóm đầu mảng.
    expect(found[0].score).toBeCloseTo(0.2 + ((anchors - 1) / anchors) * 0.7);
  });
});
