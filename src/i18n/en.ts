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

  openHistory: 'View scan history',
  openSettings: 'Open settings',
  flipCamera: 'Switch between front and back camera',
  tapToFocus: 'Tap the viewfinder to focus',
  zoomTimes: { one: 'Zoom %{count} time', other: 'Zoom %{count} times' },

  // `faceName` is a bare unit - the number is rendered separately, so it is
  // absent here. `faceCount` carries both.
  faceName: { one: 'face', other: 'faces' },
  faceCount: { one: '%{count} face', other: '%{count} faces' },

  boxLabel: 'Face, %{percent} percent confidence',
  boxHint: 'Open the face scan for this face',

  thresholdLabel: 'Confidence threshold',
  thresholdHint:
    'Swipe up or down to change the minimum confidence a face needs to show',
  percent: '%{n} percent',

  historyTitle: 'History',
  historyEmpty:
    'No scans saved yet.\nEvery capture and every scanned photo shows up here.',
  nothingFound: 'No faces found',
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
  zoomLabel: 'Zoom',
  zoomHint: 'Applies to the live viewfinder.',
  hapticsLabel: 'Vibrate when faces are detected',
  hapticsHint: 'Turn the vibration alert on or off for scans that find faces',
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
  continueAsGuest: 'Continue without an account',
  guestModeNotice:
    "You're using guest mode. Scan history won't be saved on this device or in the cloud.",
  guestSignInCta: 'Sign in or create an account',
  nameLabel: 'Display name',
  nameHint: 'What others see when a scan recognises you',
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
  authErrorExists:
    'That email already has an account - try signing in instead.',
  authErrorBadLogin: 'Wrong email or password.',
  authErrorWeakPassword: 'Password needs at least 6 characters.',
  authErrorInvalidEmail: 'That email address is not valid.',

  loadOlder: 'Show older scans',

  weekTitle: 'Last %{days} days',
  weekTotal: '%{scans} · %{faces}',

  faceUnknownShort: 'Unknown',
  faceReading: 'identifying…',
  faceNotEnrolled: 'Face not enrolled',
  faceOffline: 'Recognition server unreachable',
  faceTurnedAway: 'Turned too far to compare',
  faceUnreadable: 'Could not read this face',
  faceBlurry: 'Too blurry to read - hold steady',
  faceMisconfigured: 'Recognition is misconfigured on this build',
  enrolBlurry: 'Too blurry to enrol. Hold the phone steady and scan again.',
  faceMatchScore: '%{percent}% match',
  scanEyebrow: 'Face scan',
  scanMeshing: 'Reading the mesh…',
  scanFailed: 'No frame',
  scanFailedBody: 'The camera had nothing to hand over just then. Try again.',
  scanAgain: 'Scan this face again',
  closeScan: 'Close the face scan',
  scanConfidence: 'Detected',
  scanLandmarks: 'Mesh edges',
  faceKnownLabel: "%{name}'s face",

  faceSection: 'Your face',
  faceSectionHint:
    'Used to recognise you on a scan. The photo is never kept - only a set of numbers.',
  reEnrolFace: 'Scan again',
  deleteFace: 'Delete my face',
  deleteFaceConfirmTitle: 'Delete your enrolled face?',
  deleteFaceConfirmBody:
    'Scans stop putting your name to your face until you enrol again.',
  deleteFaceDone: 'Your face has been deleted.',
  deleteFaceFailed: 'Could not delete it. Try again.',
  enrolEyebrow: 'Setup',
  enrolTitle: 'Scan your face',
  enrolBody: 'Look straight at the camera. No photo is kept - only numbers.',
  enrolCta: 'Start',
  enrolSkip: 'Later',
  enrolScanning: 'Scanning…',
  enrolNoFace: 'No face in the frame.',
  enrolFacingFront: 'Look straight ahead',
  enrolFacingLeft: 'Now turn slightly left',
  enrolFacingRight: 'And slightly right',
  enrolProgress: 'Angle %{n} of %{total} - hold still',
  enrolWaking: 'Waking the recognition server…',
  enrolShotFailed: '%{why} (angle %{n})',
  enrolManyFaces: 'More than one face in the frame.',
  enrolTurned: 'Look straight at the camera.',
  enrolFailed: 'Could not save. Try again.',
  enrolDone: 'Face saved.',

  today: 'Today',
  yesterday: 'Yesterday',
};
