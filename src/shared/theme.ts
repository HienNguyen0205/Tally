/**
 * Design tokens của HUD: nền OLED sâu, bề mặt trong mờ nhiều lớp, viền tóc
 * sáng thay cho border xám, không đổ bóng đen thô.
 */
export const COLORS = {
  accent: '#00E676', // người
  warn: '#FFC400', // vật thể khác

  // Vỏ ngoài của kiến trúc 2 lớp (double-bezel)
  shell: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.12)',
  // Lõi trong - để đục vừa phải vì đã có blur thật phía sau lo phần tương phản.
  core: 'rgba(9,10,12,0.42)',
  coreHighlight: 'rgba(255,255,255,0.06)',

  textPrimary: '#F5F6F7',
  textMuted: 'rgba(245,246,247,0.45)',
  textFaint: 'rgba(245,246,247,0.28)',
} as const;

/** Bật nhanh rồi giảm tốc rất dài, như vật có khối lượng. */
export const EASE_OUT_EXPO = [0.32, 0.72, 0, 1] as const;

export const RADIUS = {
  shell: 30,
  // Bo góc đồng tâm: lõi trong phải trừ đi đúng phần đệm của vỏ ngoài,
  // nếu để bằng nhau thì hai đường cong sẽ lệch nhau nhìn rất rẻ tiền.
  core: 30 - 6,
  pillShell: 999,
} as const;

export const BEZEL_PAD = 6;

/**
 * Geist (Vercel, SIL OFL) - nạp từ assets/fonts qua react-native.config.js.
 * React Native trên Android KHÔNG tổng hợp weight từ một file: phải trỏ đúng
 * tên file cho từng độ đậm, dùng fontWeight kèm fontFamily sẽ ra sai nét.
 */
export const FONT = {
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semibold: 'Geist-SemiBold',
  bold: 'Geist-Bold',
} as const;

/** Cường độ blur cho lớp kính - dùng chung để các bề mặt đồng nhất. */
export const BLUR = {
  amount: 22,
  type: 'dark' as const,
};
