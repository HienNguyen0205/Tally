import React from 'react';
import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';

import { COLORS } from '../theme';

/**
 * Icon vector nét mảnh vẽ bằng Skia thay cho chữ hoặc font icon.
 * Path theo lưới 24x24, nét đều, đầu nét bo tròn.
 */
function makePath(svg: string): SkPath | null {
  return Skia.Path.MakeFromSVGString(svg);
}

const PATHS = {
  // Tia chớp - đèn flash
  bolt: makePath('M13 2 L4 14 L11.5 14 L11 22 L20 10 L12.5 10 Z'),
  // Vòng xoay có thấu kính ở giữa - đổi camera trước/sau
  flip: makePath(
    'M20.5 12 A8.5 8.5 0 1 1 18 6 M18.5 2 L18.5 6.5 L14 6.5 ' +
      'M12 9.6 A2.4 2.4 0 1 0 12 14.4 A2.4 2.4 0 1 0 12 9.6',
  ),
  // Mũi tên chúc xuống khay - lưu về máy
  download: makePath('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3'),
  // Dấu tích - đã lưu xong
  check: makePath('M20 6 L9 17 L4 12'),
  // Mũi tên quay lại - chụp lại
  refresh: makePath('M23 4 L23 10 L17 10 M20.49 15 A9 9 0 1 1 18.37 5.64 L23 10'),
  // Khung ảnh có núi và mặt trời - chọn ảnh từ thư viện
  image: makePath(
    'M3 5.5 A1.5 1.5 0 0 1 4.5 4 L19.5 4 A1.5 1.5 0 0 1 21 5.5 L21 18.5 ' +
      'A1.5 1.5 0 0 1 19.5 20 L4.5 20 A1.5 1.5 0 0 1 3 18.5 Z ' +
      'M3 16 L8.5 10.5 L14 16 M13 15 L16.5 11.5 L21 16 ' +
      'M15.5 8.5 A1.2 1.2 0 1 0 15.5 8.4',
  ),
  // Phễu lọc - lọc theo loại vật thể
  filter: makePath('M3 4.5 L21 4.5 L14 12.5 L14 20 L10 17.5 L10 12.5 Z'),
  // Mũi tên xuống - mở rộng/thu gọn (xoay 180° khi mở)
  chevron: makePath('M6 9.5 L12 15.5 L18 9.5'),
  // Vòng ngắm - ngưỡng tin cậy
  target: makePath(
    'M12 3.5 A8.5 8.5 0 1 0 12 20.5 A8.5 8.5 0 1 0 12 3.5 ' +
      'M12 8.5 A3.5 3.5 0 1 0 12 15.5 A3.5 3.5 0 1 0 12 8.5',
  ),
};

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 22,
  color = COLORS.textPrimary,
  strokeWidth = 1.7,
}: Props) {
  const path = PATHS[name];
  if (path == null) return null;

  // Path vẽ theo lưới 24 nên phải co lại cho khớp kích thước yêu cầu.
  const scale = size / 24;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeWidth / scale}
        strokeCap="round"
        strokeJoin="round"
        color={color}
        transform={[{ scale }]}
        origin={{ x: 0, y: 0 }}
      />
    </Canvas>
  );
}
