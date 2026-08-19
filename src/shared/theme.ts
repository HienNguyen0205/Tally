/**
 * HUD design tokens: deep OLED background, layered translucent surfaces,
 * bright hairlines instead of grey borders, no coarse black shadows.
 */
export const COLORS = {
  accent: '#00E676', // people
  warn: '#FFC400', // other objects
  /** Ink for anything sitting on top of `accent` - near-black with a green
   *  cast, so it reads as part of the accent rather than a black sticker. */
  onAccent: '#04120A',

  // Outer shell of the double-bezel construction
  shell: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.12)',
  // Inner core - only moderately opaque, since real blur behind it carries the
  // contrast.
  core: 'rgba(9,10,12,0.42)',
  coreHighlight: 'rgba(255,255,255,0.06)',

  textPrimary: '#F5F6F7',
  textMuted: 'rgba(245,246,247,0.45)',
  textFaint: 'rgba(245,246,247,0.28)',
} as const;

/** Quick onset then a very long settle, like something with mass. */
export const EASE_OUT_EXPO = [0.32, 0.72, 0, 1] as const;

export const RADIUS = {
  shell: 30,
  // Concentric corners: the inner core has to subtract exactly the shell's
  // padding. Leave them equal and the two curves drift apart, which reads cheap.
  core: 30 - 6,
  pillShell: 999,
} as const;

export const BEZEL_PAD = 6;

/**
 * Geist (Vercel, SIL OFL) - loaded from assets/fonts via react-native.config.js.
 * React Native on Android does NOT synthesise weights from a single file: each
 * weight needs its own file name, and fontWeight alongside fontFamily renders
 * the wrong stroke.
 */
export const FONT = {
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semibold: 'Geist-SemiBold',
  bold: 'Geist-Bold',
} as const;

/** Blur strength for the glass layer - shared so surfaces stay consistent. */
export const BLUR = {
  amount: 22,
  type: 'dark' as const,
};
