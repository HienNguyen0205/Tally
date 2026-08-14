const {
  iou,
  mergeDetections,
  passesThreshold,
} = require('../src/shared/detections');
const { PERSON_CLASS_ID } = require('../src/shared/constants');

const CHAIR = 56; // một class COCO bất kỳ khác 'person'

function box(xmin, ymin, xmax, ymax, score, classId) {
  return { xmin, ymin, xmax, ymax, score, classId };
}

describe('ngưỡng tin cậy', () => {
  it('đúng bằng ngưỡng thì vẫn được giữ', () => {
    expect(passesThreshold(box(0, 0, 1, 1, 0.6, PERSON_CLASS_ID), 0.6)).toBe(
      true,
    );
  });

  it('dưới ngưỡng thì bị loại', () => {
    expect(passesThreshold(box(0, 0, 1, 1, 0.59, PERSON_CLASS_ID), 0.6)).toBe(
      false,
    );
  });

  // Chặn đúng lỗi đã gặp: kéo thanh lên 90% mà vật thể 73%/74% vẫn hiện, vì
  // class không phải 'person' từng được hạ ngưỡng riêng.
  it('mọi class chịu chung một ngưỡng, không ưu ái class nào', () => {
    for (const classId of [PERSON_CLASS_ID, CHAIR]) {
      expect(passesThreshold(box(0, 0, 1, 1, 0.73, classId), 0.9)).toBe(false);
      expect(passesThreshold(box(0, 0, 1, 1, 0.91, classId), 0.9)).toBe(true);
    }
  });
});

describe('iou', () => {
  it('trùng khít = 1', () => {
    const a = box(0.1, 0.1, 0.5, 0.5, 0.9, PERSON_CLASS_ID);
    expect(iou(a, a)).toBeCloseTo(1);
  });

  it('rời hẳn = 0', () => {
    const a = box(0, 0, 0.2, 0.2, 0.9, PERSON_CLASS_ID);
    const b = box(0.5, 0.5, 0.9, 0.9, 0.9, PERSON_CLASS_ID);
    expect(iou(a, b)).toBe(0);
  });

  it('chồng một nửa theo mỗi cạnh', () => {
    // Hai ô vuông cạnh 0.4 lệch nhau 0.2 mỗi chiều: giao 0.2x0.2 = 0.04,
    // hợp = 0.16 + 0.16 - 0.04 = 0.28.
    const a = box(0, 0, 0.4, 0.4, 0.9, PERSON_CLASS_ID);
    const b = box(0.2, 0.2, 0.6, 0.6, 0.9, PERSON_CLASS_ID);
    expect(iou(a, b)).toBeCloseTo(0.04 / 0.28);
  });
});

describe('gộp kết quả hai lượt quét', () => {
  const IOU = 0.55;

  it('cùng vật thể ở hai lượt chỉ còn một, giữ bản điểm cao hơn', () => {
    const wide = [box(0.2, 0.2, 0.6, 0.6, 0.71, PERSON_CLASS_ID)];
    const tight = [box(0.21, 0.21, 0.61, 0.61, 0.88, PERSON_CLASS_ID)];

    const merged = mergeDetections([wide, tight], IOU);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeCloseTo(0.88);
  });

  // Lý do chính để chạy lượt 'cover': vật thể nhỏ ở giữa khung mà lượt toàn
  // cảnh trượt hẳn.
  it('vật thể chỉ một lượt thấy vẫn được giữ', () => {
    const wide = [box(0.1, 0.1, 0.3, 0.3, 0.8, PERSON_CLASS_ID)];
    const tight = [
      box(0.1, 0.1, 0.3, 0.3, 0.8, PERSON_CLASS_ID),
      box(0.7, 0.7, 0.78, 0.78, 0.52, CHAIR),
    ];

    const merged = mergeDetections([wide, tight], IOU);
    expect(merged).toHaveLength(2);
    expect(merged.some(d => d.classId === CHAIR)).toBe(true);
  });

  it('hai vật thể khác class chồng nhau đều được giữ', () => {
    // Người bế con mèo: chồng gần như hoàn toàn nhưng là hai vật thể thật.
    const a = box(0.2, 0.2, 0.6, 0.6, 0.9, PERSON_CLASS_ID);
    const b = box(0.2, 0.2, 0.6, 0.6, 0.7, CHAIR);

    expect(mergeDetections([[a], [b]], IOU)).toHaveLength(2);
  });

  it('trả về theo thứ tự điểm giảm dần', () => {
    const merged = mergeDetections(
      [
        [box(0, 0, 0.1, 0.1, 0.4, CHAIR)],
        [box(0.5, 0.5, 0.6, 0.6, 0.95, PERSON_CLASS_ID)],
      ],
      IOU,
    );
    expect(merged.map(d => d.score)).toEqual([0.95, 0.4]);
  });
});
