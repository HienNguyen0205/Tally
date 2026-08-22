/**
 * Vietnamese catalog - the source of truth for both the copy and the shape.
 *
 * Every other locale is typed against this object, so adding a key here and
 * forgetting to translate it fails the build rather than shipping a
 * `[missing "en.foo" translation]` placeholder to a user.
 *
 * Interpolation uses i18n-js's `%{name}` syntax. The argument types live in
 * `Params` below and have to be kept in step with the placeholders by hand -
 * that pairing is what keeps `t('zoomTimes', { count: 3 })` checked at compile
 * time instead of failing silently at runtime.
 *
 * Every value here is a single string, deliberately: Vietnamese does not
 * inflect nouns for number, so `3 người` and `1 người` are the same word. The
 * plural forms live in the locales that need them - see `EnCatalog`.
 *
 * Developer-facing text - thrown Error messages, console.warn - deliberately
 * stays out of here and stays English. It ends up in logcat, not in front of a
 * user, and translating diagnostics only makes them harder to search for.
 */
export const vi = {
  close: 'Đóng',

  // Status screens
  deviceEyebrow: 'THIẾT BỊ',
  noCamera: 'Không tìm thấy camera',
  permissionEyebrow: 'QUYỀN TRUY CẬP',
  cameraPermissionTitle: 'Cần quyền dùng camera',
  cameraPermissionBody:
    'Nhận diện xử lý hoàn toàn trên máy. Lịch sử quét được sao lưu ẩn danh ' +
    'lên đám mây để không mất khi đổi máy hoặc cài lại app.',
  grantPermission: 'Cấp quyền',
  errorEyebrow: 'LỖI',
  modelLoadFailed: 'Không nạp được model',
  resizerFailed: 'Không khởi tạo được resizer',
  loadingModel: 'Đang nạp mô hình',
  loadingAccount: 'Đang kiểm tra tài khoản',

  // Camera controls
  openHistory: 'Xem lịch sử quét',
  openSettings: 'Mở cài đặt',
  flipCamera: 'Đổi camera trước sau',
  tapToFocus: 'Chạm vào khung hình để lấy nét',
  zoomTimes: 'Phóng to %{count} lần',

  // Scanning

  // The detector's one class. `faceName` is the bare noun - the number sits in
  // its own Text beside it, at a different size, so it is not part of the
  // string. `faceCount` is the two together, for running prose.
  faceName: 'khuôn mặt',
  faceCount: '%{count} khuôn mặt',

  // Detection box. No name in the label: with one class it would say "khuôn
  // mặt" on every single box.
  boxLabel: 'Khuôn mặt, độ tin cậy %{percent} phần trăm',
  boxHint: 'Mở bản quét khuôn mặt này',

  // Threshold slider
  thresholdLabel: 'Ngưỡng tin cậy',
  thresholdHint:
    'Vuốt lên hoặc xuống để đổi mức tin cậy tối thiểu của khuôn mặt được hiện',
  percent: '%{n} phần trăm',

  // Review bar

  // Photo picker

  // History
  historyTitle: 'Lịch sử',
  historyEmpty:
    'Chưa có lần quét nào được lưu.\nMỗi lần chụp hoặc quét ảnh sẽ tự xuất hiện ở đây.',
  nothingFound: 'Không tìm thấy khuôn mặt nào',
  removeScan: 'Xoá lần quét này',
  selectScans: 'Chọn nhiều lần quét',
  cancelSelect: 'Huỷ',
  selectAll: 'Chọn tất cả',
  deselectAll: 'Bỏ chọn tất cả',
  deleteSelected: 'Xoá %{n}',
  selectRow: 'Chọn lần quét này',
  deselectRow: 'Bỏ chọn lần quét này',
  openScan: 'Mở lại lần quét này',
  noPreview: 'Lần quét này được lưu trước khi có ảnh xem lại.',
  shareHistory: 'Xuất CSV',
  shareSubject: 'Lịch sử quét Tally',

  // Settings screen
  settingsTitle: 'Cài đặt',
  languageSection: 'NGÔN NGỮ',
  detectionSection: 'PHÁT HIỆN',
  zoomLabel: 'Thu phóng',
  zoomHint: 'Áp dụng cho khung ngắm trực tiếp.',
  hapticsLabel: 'Rung khi phát hiện khuôn mặt',
  hapticsHint: 'Bật hoặc tắt cảnh báo rung khi quét thấy khuôn mặt',
  defaultThresholdLabel: 'Ngưỡng tin cậy mặc định',
  defaultThresholdHint:
    'Mức tin cậy dùng mỗi khi mở app, không ảnh hưởng lần quét đang xem',
  dataSection: 'DỮ LIỆU',
  clearHistory: 'Xoá lịch sử quét',
  clearHistoryHint: 'Xoá toàn bộ lịch sử đã lưu, gồm cả bản sao trên đám mây',
  clearHistoryConfirmTitle: 'Xoá toàn bộ lịch sử?',
  clearHistoryConfirmBody:
    'Xoá vĩnh viễn %{count} đã lưu trên máy này và trên đám mây. Không thể hoàn tác.',
  scanCount: '%{count} lần quét',

  // Account
  changeLanguage: 'Đổi ngôn ngữ',
  authEyebrow: 'TÀI KHOẢN',
  signedInAs: 'Đã đăng nhập: %{email}',
  continueAsGuest: 'Tiếp tục không cần tài khoản',
  guestModeNotice:
    'Đang dùng ở chế độ khách. Lịch sử quét sẽ không được lưu trên máy này hay trên đám mây.',
  guestSignInCta: 'Đăng nhập hoặc tạo tài khoản',
  nameLabel: 'Tên hiển thị',
  nameHint: 'Tên người khác thấy khi quét trúng bạn',
  emailLabel: 'Email',
  emailHint: 'ban@vidu.com',
  passwordLabel: 'Mật khẩu',
  passwordHint: 'Ít nhất 6 ký tự',
  showPassword: 'Hiện mật khẩu',
  hidePassword: 'Ẩn mật khẩu',
  signOut: 'Đăng xuất',
  signOutConfirmTitle: 'Đăng xuất?',
  signOutConfirmBody: 'Đăng xuất khỏi %{email}.',
  tabRegister: 'Tạo tài khoản',
  tabSignIn: 'Đăng nhập',
  registerSubmit: 'Tạo tài khoản',
  signInSubmit: 'Đăng nhập',
  confirmEmailSent:
    'Đã gửi email xác nhận tới %{email}. Mở hộp thư để hoàn tất.',
  authErrorGeneric: 'Có lỗi xảy ra, thử lại sau.',
  authErrorExists: 'Email này đã có tài khoản - thử đăng nhập thay vì tạo mới.',
  authErrorBadLogin: 'Sai email hoặc mật khẩu.',
  authErrorWeakPassword: 'Mật khẩu cần ít nhất 6 ký tự.',
  authErrorInvalidEmail: 'Email không hợp lệ.',

  // Batch result.
  //
  // `weekTotal` interpolates already-rendered phrases rather than numbers: it
  // has two counts in one sentence, and i18n-js pluralises on a single
  // `count`, so the only way each half can inflect is to render it on its own
  // first. That is what faceCount and scanCount are for.

  // Paging older scans back down from the cloud, past the local cap.
  loadOlder: 'Xem các lần quét cũ hơn',

  // Rolling summary above the history list. Same pre-rendered-halves trick as
  // `batchTotal` above, for the same reason - three counts, one `count`.
  weekTitle: '%{days} ngày qua',
  weekTotal: '%{scans} · %{faces}',

  // Face recognition
  faceUnknownShort: 'Chưa rõ',
  faceReading: 'đang nhận diện…',
  faceOffline: 'Không kết nối được máy chủ nhận diện',
  faceNotEnrolled: 'Khuôn mặt chưa đăng ký',
  faceTurnedAway: 'Mặt nghiêng quá, không đối chiếu được',
  faceUnreadable: 'Không đọc được khuôn mặt',
  faceBlurry: 'Ảnh mờ quá - giữ máy yên',
  faceMisconfigured: 'Nhận diện bị cấu hình sai ở bản dựng này',
  enrolBlurry: 'Ảnh mờ quá, chưa lưu được. Giữ máy yên rồi quét lại.',
  faceMatchScore: 'Khớp %{percent}%',
  scanEyebrow: 'Bản quét khuôn mặt',
  scanMeshing: 'Đang đọc lưới…',
  scanFailed: 'Không có khung hình',
  scanFailedBody: 'Camera không đưa được khung hình nào lúc đó. Thử lại.',
  scanAgain: 'Quét lại khuôn mặt này',
  closeScan: 'Đóng bản quét',
  scanConfidence: 'Phát hiện',
  scanLandmarks: 'Cạnh lưới',
  faceKnownLabel: 'Khuôn mặt của %{name}',

  // Face enrolment
  faceSection: 'Khuôn mặt của bạn',
  faceSectionHint:
    'Dùng để nhận ra bạn khi quét. Ảnh không bao giờ được lưu — chỉ lưu một dãy số.',
  reEnrolFace: 'Quét lại',
  deleteFace: 'Xoá khuôn mặt',
  deleteFaceConfirmTitle: 'Xoá khuôn mặt đã đăng ký?',
  deleteFaceConfirmBody:
    'Các lần quét sẽ không gọi đúng tên bạn nữa, cho tới khi bạn đăng ký lại.',
  deleteFaceDone: 'Đã xoá khuôn mặt của bạn.',
  deleteFaceFailed: 'Chưa xoá được. Thử lại.',
  enrolEyebrow: 'Thiết lập',
  enrolTitle: 'Quét khuôn mặt',
  enrolBody: 'Nhìn thẳng vào camera. Không lưu ảnh, chỉ lưu dãy số.',
  enrolCta: 'Bắt đầu',
  enrolSkip: 'Để sau',
  enrolScanning: 'Đang quét…',
  enrolNoFace: 'Chưa thấy khuôn mặt trong khung.',
  enrolFacingFront: 'Nhìn thẳng vào máy',
  enrolFacingLeft: 'Quay nhẹ sang trái',
  enrolFacingRight: 'Rồi quay nhẹ sang phải',
  enrolProgress: 'Góc %{n} trên %{total} - giữ yên',
  enrolWaking: 'Đang đánh thức máy chủ nhận diện…',
  enrolShotFailed: '%{why} (góc %{n})',
  enrolManyFaces: 'Có nhiều hơn một khuôn mặt.',
  enrolTurned: 'Nhìn thẳng vào camera.',
  enrolFailed: 'Chưa lưu được. Thử lại.',
  enrolDone: 'Đã lưu khuôn mặt.',

  // Day headers
  today: 'Hôm nay',
  yesterday: 'Hôm qua',

  // Running total
} as const;

export type StringKey = keyof typeof vi;

/** One string per grammatical number, as i18n-js expects it. */
export interface PluralForms {
  readonly one: string;
  readonly other: string;
}

const PLURAL_KEY_LIST = [
  'zoomTimes',
  'faceName',
  'faceCount',
  'scanCount',
] as const;

/** The keys whose English wording changes with the number beside it. */
export type PluralKey = (typeof PLURAL_KEY_LIST)[number];

/**
 * The same list at runtime, for the catalog tests. Annotated as `StringKey[]`
 * so a key that does not exist in the catalog is a build error here rather than
 * a silently ineffective entry.
 */
export const PLURAL_KEYS: readonly StringKey[] = PLURAL_KEY_LIST;

/**
 * The shape a locale that inflects for number has to fill: plural forms for
 * exactly `PLURAL_KEYS`, a plain string everywhere else. Getting either side
 * wrong - forms on a key that does not need them, or a bare string on one that
 * does - is a build error.
 */
export type InflectedCatalog = {
  readonly [K in StringKey]: K extends PluralKey ? PluralForms : string;
};

/**
 * Arguments for the keys that interpolate. A key absent from here takes none,
 * and `t()` enforces both directions: no args where none are wanted, and the
 * right ones where they are.
 *
 * Extending `Record<PluralKey, { count: number }>` is load-bearing, not
 * decoration. i18n-js pluralises on the option named `count` specifically, so a
 * pluralising key whose number arrives as `n` or `z` would skip pluralisation
 * entirely and hand React the raw `{ one, other }` object. This makes that a
 * build error instead.
 */
export interface Params extends Record<PluralKey, { count: number }> {
  zoomTimes: { count: number };
  faceName: { count: number };
  faceCount: { count: number };
  boxLabel: { percent: number };
  percent: { n: number };
  deleteSelected: { n: number };
  signOutConfirmBody: { email: string };
  confirmEmailSent: { email: string };
  scanCount: { count: number };
  faceMatchScore: { percent: number };
  faceKnownLabel: { name: string };
  /** Always WEEK_DAYS (history.ts), so it never needs to inflect. */
  weekTitle: { days: number };
  /** Both are rendered strings - see `weekTotal` in the catalog above. */
  weekTotal: { scans: string; faces: string };
  /** Pre-rendered via `scanCount` - same reason `weekTotal` takes strings. */
  clearHistoryConfirmBody: { count: string };
  signedInAs: { email: string };
  enrolProgress: { n: number; total: number };
  /** `why` is already a translated sentence - the reason the shot failed,
   *  chosen by the caller and simply framed by this string. */
  enrolShotFailed: { why: string; n: number };
}
