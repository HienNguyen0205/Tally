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
