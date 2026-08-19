import type { InflectedCatalog } from './vi';

/**
 * English catalog.
 *
 * Typed as `InflectedCatalog`, so a key missing here - or one that no longer
 * exists in `vi` - is a build error, and so is a pluralising key given a bare
 * string instead of `{ one, other }`.
 *
 * i18n-js picks the form from the `count` argument and only then interpolates,
 * so `%{count}` inside a form is substituted as usual. `zero` is never needed:
 * with no `zero` key the lookup falls through to `other`, which is the right
 * English for 0 ("0 objects").
 */
export const en: InflectedCatalog = {
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
  loadingAccount: 'Checking your account',

  torchOn: 'Turn the torch on',
  torchOff: 'Turn the torch off',
  pickFromLibrary: 'Scan a photo from the library',
  openHistory: 'View scan history',
  openSettings: 'Open settings',
  flipCamera: 'Switch between front and back camera',
  shutter: 'Capture and scan',
  tapToFocus: 'Tap the viewfinder to focus',
  closeDetail: 'Close the detail sheet',
  zoomTimes: { one: 'Zoom %{count} time', other: 'Zoom %{count} times' },

  scanning: 'SCANNING',
  scanningProgress: 'SCANNING %{done}/%{total}',
  scanFailed: 'Could not scan the photo',

  // Bare units - the number is rendered separately, so it is absent here.
  people: { one: 'person', other: 'people' },
  objects: { one: 'object', other: 'objects' },

  classCount: { one: '%{count} class', other: '%{count} classes' },
  classCountPartial: {
    one: '%{shown}/%{count} class',
    other: '%{shown}/%{count} classes',
  },
  classChip: {
    one: '%{name}, %{count} object',
    other: '%{name}, %{count} objects',
  },
  classChipHint: 'Show or hide this class on the image',
  expandFilter: 'Open the class filter',
  collapseFilter: 'Collapse the class filter',

  boxLabel: '%{name}, %{percent} percent confidence',
  boxHint: 'Open the detail sheet for this object',
  identifying: 'identifying…',

  thresholdLabel: 'Confidence threshold',
  thresholdHint:
    'Swipe up or down to change the minimum confidence an object needs to show',
  percent: '%{n} percent',

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
  limitedNotice: {
    one: 'Only %{count} allowed photo · Choose more',
    other: 'Only %{count} allowed photos · Choose more',
  },
  selectPhoto: 'Select this photo to scan',
  deselectPhoto: 'Deselect this photo',
  scanSelected: { one: 'Scan %{count} photo', other: 'Scan %{count} photos' },

  historyTitle: 'History',
  historyEmpty:
    'No scans saved yet.\nEvery capture and every scanned photo shows up here.',
  nothingFound: 'No objects found',
  removeScan: 'Delete this scan',
  selectScans: 'Select several scans',
  cancelSelect: 'Cancel',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  deleteSelected: 'Delete %{n}',
  selectRow: 'Select this scan',
  deselectRow: 'Deselect this scan',
  openScan: 'Open this scan',
  noPreview: 'This scan was saved before previews existed.',
  shareHistory: 'Export CSV',
  shareSubject: 'Tally scan history',

  settingsTitle: 'Settings',
  languageSection: 'LANGUAGE',
  detectionSection: 'DETECTION',
  hapticsLabel: 'Vibrate when people are detected',
  hapticsHint: 'Turn the vibration alert on or off for scans that find people',
  defaultThresholdLabel: 'Default confidence threshold',
  defaultThresholdHint:
    "Used every time the app opens - does not change the scan you're viewing",
  dataSection: 'DATA',
  clearHistory: 'Clear scan history',
  clearHistoryHint: 'Deletes all saved history, including the cloud copy',
  clearHistoryConfirmTitle: 'Clear all history?',
  clearHistoryConfirmBody:
    'Permanently deletes %{count} saved on this device and in the cloud. This cannot be undone.',
  scanCount: { one: '%{count} scan', other: '%{count} scans' },

  changeLanguage: 'Change language',
  authEyebrow: 'ACCOUNT',
  signedInAs: 'Signed in: %{email}',
  authSubtitle: 'Sign in to start counting',
  continueAsGuest: 'Continue without an account',
  guestModeNotice:
    "You're using guest mode. Scan history won't be saved on this device or in the cloud.",
  guestSignInCta: 'Sign in or create an account',
  emailLabel: 'Email',
  emailHint: 'you@example.com',
  passwordLabel: 'Password',
  passwordHint: 'At least 6 characters',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  signOut: 'Sign out',
  signOutConfirmTitle: 'Sign out?',
  signOutConfirmBody: 'Sign out of %{email}.',
  tabRegister: 'Sign up',
  tabSignIn: 'Sign in',
  registerSubmit: 'Register',
  signInSubmit: 'Sign in',
  confirmEmailSent:
    'Confirmation email sent to %{email}. Check your inbox to finish.',
  authErrorGeneric: 'Something went wrong, try again.',
  authErrorExists: 'That email already has an account - try signing in instead.',
  authErrorBadLogin: 'Wrong email or password.',
  authErrorWeakPassword: 'Password needs at least 6 characters.',
  authErrorInvalidEmail: 'That email address is not valid.',

  batchTitle: {
    one: 'Just scanned %{count} photo',
    other: 'Just scanned %{count} photos',
  },
  batchTotal: '%{people}, %{total} in total',
  peopleCount: { one: '%{count} person', other: '%{count} people' },
  objectCount: { one: '%{count} object', other: '%{count} objects' },
  countOf: '%{count} %{name}',

  today: 'Today',
  yesterday: 'Yesterday',

  sumStart: 'Start adding captures up',
  sumStop: 'Stop adding up',
  sumTotal: 'total',
  sumPhotos: { one: '%{count} photo', other: '%{count} photos' },
};
