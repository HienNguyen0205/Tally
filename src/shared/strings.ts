/**
 * UI strings, Vietnamese and English.
 *
 * No i18n library: the whole surface is one screen and a couple of sheets, and
 * a dependency plus a provider plus JSON bundles would be more machinery than
 * the problem. `vi` defines the shape and `en` is typed against it, so TypeScript
 * fails the build the moment a translation goes missing.
 *
 * Values that interpolate are functions rather than templates with placeholders,
 * which keeps the argument count and types checked instead of hoping a `{n}`
 * survives translation.
 *
 * Developer-facing text - thrown Error messages, console.warn - deliberately
 * stays out of here and stays English. It ends up in logcat, not in front of a
 * user, and translating diagnostics only makes them harder to search for.
 */

const vi = {
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

  // Camera controls
  torchOn: 'Bật đèn flash',
  torchOff: 'Tắt đèn flash',
  pickFromLibrary: 'Quét ảnh có sẵn trong thư viện',
  openHistory: 'Xem lịch sử quét',
  flipCamera: 'Đổi camera trước sau',
  shutter: 'Chụp và quét',
  tapToFocus: 'Chạm vào khung hình để lấy nét',
  closeDetail: 'Đóng bảng chi tiết',
  zoomTimes: (z: number) => `Phóng to ${z} lần`,

  // Scanning
  scanning: 'ĐANG QUÉT',
  scanningProgress: (done: number, total: number) =>
    `ĐANG QUÉT ${done}/${total}`,
  scanFailed: 'Không quét được ảnh',

  // Result island
  people: 'người',
  objects: 'vật thể',

  // Class filter
  classCount: (n: number) => `${n} loại`,
  classCountPartial: (shown: number, n: number) => `${shown}/${n} loại`,
  classChip: (name: string, count: number) => `${name}, ${count} vật thể`,
  classChipHint: 'Bật tắt hiển thị loại này trên ảnh',
  expandFilter: 'Mở bộ lọc loại vật thể',
  collapseFilter: 'Thu gọn bộ lọc loại vật thể',

  // Detection box
  boxLabel: (name: string, percent: number) =>
    `${name}, độ tin cậy ${percent} phần trăm`,
  boxHint: 'Mở thẻ chi tiết của vật thể này',
  identifying: 'đang nhận dạng…',

  // Threshold slider
  thresholdLabel: 'Ngưỡng tin cậy',
  thresholdHint:
    'Vuốt lên hoặc xuống để đổi mức tin cậy tối thiểu của vật thể được hiện',
  percent: (n: number) => `${n} phần trăm`,

  // Review bar
  saving: 'Đang lưu…',
  saved: 'Đã lưu vào thư viện',
  saveFailed: 'Lưu thất bại, chạm để thử lại',
  retake: 'Chụp lại',
  saveAnnotated: 'Lưu ảnh đã gắn khung vào thư viện',

  // Photo picker
  pickTitle: 'Chọn ảnh',
  needPhotoPermission: 'Cần quyền đọc ảnh để chọn từ thư viện.',
  cannotReadLibrary: 'Không đọc được thư viện ảnh.',
  noPhotosGranted: 'Bạn chưa cho ứng dụng xem ảnh nào.',
  noPhotos: 'Thư viện chưa có ảnh nào.',
  grantMorePhotos: 'Chọn ảnh cho phép',
  limitedNotice: (n: number) => `Chỉ thấy ${n} ảnh bạn đã cho phép · Chọn thêm`,
  selectPhoto: 'Chọn ảnh này để quét',
  deselectPhoto: 'Bỏ chọn ảnh này',
  scanSelected: (n: number) => `Quét ${n} ảnh`,

  // History
  historyTitle: 'Lịch sử',
  historyEmpty:
    'Chưa có lần quét nào được lưu.\nMỗi lần chụp hoặc quét ảnh sẽ tự xuất hiện ở đây.',
  nothingFound: 'Không tìm thấy vật thể nào',
  removeScan: 'Xoá lần quét này',
  selectScans: 'Chọn nhiều lần quét',
  cancelSelect: 'Huỷ',
  selectAll: 'Chọn tất cả',
  deselectAll: 'Bỏ chọn tất cả',
  deleteSelected: (n: number) => `Xoá ${n}`,
  selectRow: 'Chọn lần quét này',
  deselectRow: 'Bỏ chọn lần quét này',
  openScan: 'Mở lại lần quét này',
  noPreview: 'Lần quét này được lưu trước khi có ảnh xem lại.',
  shareHistory: 'Xuất CSV',
  shareSubject: 'Lịch sử quét Tally',
  shareFailed: 'Không chia sẻ được lịch sử',
  batchTitle: (n: number) => `Vừa quét ${n} ảnh`,
  batchTotal: (people: number, total: number) =>
    `Tổng cộng ${people} người · ${total} vật thể`,
  countOf: (count: number, name: string) => `${count} ${name}`,

  // Day headers
  today: 'Hôm nay',
  yesterday: 'Hôm qua',

  // Running total
  sumStart: 'Bắt đầu cộng dồn nhiều lần chụp',
  sumStop: 'Dừng cộng dồn',
  sumTotal: 'tổng',
  sumPhotos: (n: number) => `${n} ảnh`,
} as const;

type Strings = {
  readonly [K in keyof typeof vi]: (typeof vi)[K] extends (
    ...args: infer A
  ) => string
    ? (...args: A) => string
    : string;
};

const en: Strings = {
  close: 'Close',

  deviceEyebrow: 'DEVICE',
  noCamera: 'No camera found',
  permissionEyebrow: 'PERMISSION',
  cameraPermissionTitle: 'Camera access needed',
  cameraPermissionBody:
    'Detection runs entirely on the device. Scan history is backed up ' +
    'anonymously to the cloud so it survives a lost or reinstalled phone.',
  grantPermission: 'Grant access',
  errorEyebrow: 'ERROR',
  modelLoadFailed: 'Could not load the model',
  resizerFailed: 'Could not start the resizer',
  loadingModel: 'Loading the model',

  torchOn: 'Turn the torch on',
  torchOff: 'Turn the torch off',
  pickFromLibrary: 'Scan a photo from the library',
  openHistory: 'View scan history',
  flipCamera: 'Switch between front and back camera',
  shutter: 'Capture and scan',
  tapToFocus: 'Tap the viewfinder to focus',
  closeDetail: 'Close the detail sheet',
  zoomTimes: (z: number) => `Zoom ${z} times`,

  scanning: 'SCANNING',
  scanningProgress: (done: number, total: number) =>
    `SCANNING ${done}/${total}`,
  scanFailed: 'Could not scan the photo',

  people: 'people',
  objects: 'objects',

  classCount: (n: number) => `${n} classes`,
  classCountPartial: (shown: number, n: number) => `${shown}/${n} classes`,
  classChip: (name: string, count: number) => `${name}, ${count} objects`,
  classChipHint: 'Show or hide this class on the image',
  expandFilter: 'Open the class filter',
  collapseFilter: 'Collapse the class filter',

  boxLabel: (name: string, percent: number) =>
    `${name}, ${percent} percent confidence`,
  boxHint: 'Open the detail sheet for this object',
  identifying: 'identifying…',

  thresholdLabel: 'Confidence threshold',
  thresholdHint:
    'Swipe up or down to change the minimum confidence an object needs to show',
  percent: (n: number) => `${n} percent`,

  saving: 'Saving…',
  saved: 'Saved to the library',
  saveFailed: 'Save failed, tap to retry',
  retake: 'Retake',
  saveAnnotated: 'Save the annotated image to the library',

  pickTitle: 'Pick a photo',
  needPhotoPermission: 'Photo access is needed to pick from the library.',
  cannotReadLibrary: 'Could not read the photo library.',
  noPhotosGranted: 'You have not let the app see any photos yet.',
  noPhotos: 'The library has no photos.',
  grantMorePhotos: 'Choose which photos to allow',
  limitedNotice: (n: number) => `Only ${n} allowed photos · Choose more`,
  selectPhoto: 'Select this photo to scan',
  deselectPhoto: 'Deselect this photo',
  scanSelected: (n: number) => `Scan ${n} photos`,

  historyTitle: 'History',
  historyEmpty:
    'No scans saved yet.\nEvery capture and every scanned photo shows up here.',
  nothingFound: 'No objects found',
  removeScan: 'Delete this scan',
  selectScans: 'Select several scans',
  cancelSelect: 'Cancel',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  deleteSelected: (n: number) => `Delete ${n}`,
  selectRow: 'Select this scan',
  deselectRow: 'Deselect this scan',
  openScan: 'Open this scan',
  noPreview: 'This scan was saved before previews existed.',
  shareHistory: 'Export CSV',
  shareSubject: 'Tally scan history',
  shareFailed: 'Could not share the history',
  batchTitle: (n: number) => `Just scanned ${n} photos`,
  batchTotal: (people: number, total: number) =>
    `${people} people, ${total} objects in total`,
  countOf: (count: number, name: string) => `${count} ${name}`,

  today: 'Today',
  yesterday: 'Yesterday',

  sumStart: 'Start adding captures up',
  sumStop: 'Stop adding up',
  sumTotal: 'total',
  sumPhotos: (n: number) => `${n} photos`,
};

export type Locale = 'vi' | 'en';

/**
 * Vietnamese unless the device asks for something else - this is a Vietnamese
 * app first, and English is the fallback rather than the default.
 *
 * Read once at module load. The device language cannot change without restarting
 * the app, so re-reading it per render would buy nothing.
 */
function detectLocale(): Locale {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    return tag.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    // Intl is compiled out of some Hermes builds. Falling back to the primary
    // language beats crashing on the first string the app renders.
    return 'vi';
  }
}

export const locale: Locale = detectLocale();

export const t: Strings = locale === 'en' ? en : vi;
