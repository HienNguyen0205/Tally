import { locale } from '../i18n';

/**
 * YOLO's 80 COCO labels, taken from metadata.json inside the .tflite file.
 * Array index = the classId the model returns.
 *
 * DIFFERENT from EfficientDet's 90-class list: YOLO numbers them contiguously,
 * with no '???' gaps. Use the wrong table and every class but 'person' gets the
 * wrong name.
 */
export const COCO_LABELS = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
];

const VI: Record<string, string> = {
  person: 'người',
  bicycle: 'xe đạp',
  car: 'ô tô',
  motorcycle: 'xe máy',
  airplane: 'máy bay',
  bus: 'xe buýt',
  train: 'tàu hoả',
  truck: 'xe tải',
  boat: 'thuyền',
  'traffic light': 'đèn giao thông',
  'fire hydrant': 'trụ cứu hoả',
  'stop sign': 'biển báo dừng',
  'parking meter': 'máy tính tiền đỗ xe',
  bench: 'ghế băng',
  bird: 'chim',
  cat: 'mèo',
  dog: 'chó',
  horse: 'ngựa',
  sheep: 'cừu',
  cow: 'bò',
  elephant: 'voi',
  bear: 'gấu',
  zebra: 'ngựa vằn',
  giraffe: 'hươu cao cổ',
  backpack: 'ba lô',
  umbrella: 'ô dù',
  handbag: 'túi xách',
  tie: 'cà vạt',
  suitcase: 'vali',
  frisbee: 'đĩa ném',
  skis: 'ván trượt tuyết',
  snowboard: 'ván trượt tuyết đơn',
  'sports ball': 'bóng',
  kite: 'diều',
  'baseball bat': 'gậy bóng chày',
  'baseball glove': 'găng bóng chày',
  skateboard: 'ván trượt',
  surfboard: 'ván lướt sóng',
  'tennis racket': 'vợt tennis',
  bottle: 'chai',
  'wine glass': 'ly rượu',
  cup: 'cốc',
  fork: 'nĩa',
  knife: 'dao',
  spoon: 'thìa',
  bowl: 'bát',
  banana: 'chuối',
  apple: 'táo',
  sandwich: 'bánh mì kẹp',
  orange: 'cam',
  broccoli: 'súp lơ',
  carrot: 'cà rốt',
  'hot dog': 'xúc xích kẹp',
  pizza: 'pizza',
  donut: 'bánh vòng',
  cake: 'bánh ngọt',
  chair: 'ghế',
  couch: 'ghế sofa',
  'potted plant': 'chậu cây',
  bed: 'giường',
  'dining table': 'bàn ăn',
  toilet: 'bồn cầu',
  tv: 'tivi',
  laptop: 'máy tính xách tay',
  mouse: 'chuột máy tính',
  remote: 'điều khiển từ xa',
  keyboard: 'bàn phím',
  'cell phone': 'điện thoại',
  microwave: 'lò vi sóng',
  oven: 'lò nướng',
  toaster: 'máy nướng bánh',
  sink: 'bồn rửa',
  refrigerator: 'tủ lạnh',
  book: 'sách',
  clock: 'đồng hồ',
  vase: 'lọ hoa',
  scissors: 'kéo',
  'teddy bear': 'gấu bông',
  'hair drier': 'máy sấy tóc',
  toothbrush: 'bàn chải',
};

/**
 * The class name in the device's language.
 *
 * Falls back to the COCO name when there is no translation, and to `#id` when
 * the model returns a class outside the table - which means the label list and
 * the model have drifted apart, and showing the raw index makes that obvious
 * rather than silently mislabelling.
 */
export function label(classId: number): string {
  const name = COCO_LABELS[classId];
  if (name == null) return `#${classId}`;
  return locale === 'vi' ? VI[name] ?? name : name;
}

/**
 * English plurals that a suffix rule gets wrong: an irregular noun ('person'),
 * an invariant one ('sheep', 'scissors'), or a COCO name that is already
 * plural on its own ('skis' - one ski board is still tagged as the class
 * 'skis', not 'ski').
 */
const IRREGULAR_PLURAL_EN: Record<string, string> = {
  person: 'people',
  sheep: 'sheep',
  skis: 'skis',
  scissors: 'scissors',
  knife: 'knives',
  mouse: 'mice',
};

/**
 * English pluralises the last word of a (possibly multi-word) COCO name by the
 * regular suffix rule, unless it is one of the six exceptions above - checked
 * because it is cheaper and safer than an 80-entry table, but every COCO name
 * was run through it once by hand to confirm the rest come out right (see
 * assets/models/README.md for the source list).
 */
function pluralizeEn(name: string): string {
  const words = name.split(' ');
  const last = words[words.length - 1];
  const irregular = IRREGULAR_PLURAL_EN[last];
  const plural =
    irregular ??
    (/(?:s|x|z|ch|sh)$/.test(last)
      ? `${last}es`
      : /[^aeiou]y$/.test(last)
        ? `${last.slice(0, -1)}ies`
        : `${last}s`);
  return [...words.slice(0, -1), plural].join(' ');
}

/**
 * The class name inflected for `count`, in the device's language.
 *
 * Vietnamese does not inflect nouns for number, so `label()` already returns
 * the right word for any count - this only branches for English. Only
 * `HistorySheet`'s scan breakdown needs a plural name in a sentence like
 * "3 people, 2 boats"; every other caller shows a name beside its own count
 * badge rather than inside one string, where the singular form reads fine
 * regardless of the number.
 */
export function labelForCount(classId: number, count: number): string {
  const name = label(classId);
  if (locale !== 'en' || count === 1) return name;
  return pluralizeEn(name);
}
