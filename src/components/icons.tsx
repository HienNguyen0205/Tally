import React from 'react';
import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';

import { COLORS } from '../shared/theme';

/**
 * Thin-stroke vector icons drawn with Skia instead of glyphs or an icon font.
 * Paths follow a 24x24 grid, even stroke, rounded caps.
 */
function makePath(svg: string): SkPath | null {
  return Skia.Path.MakeFromSVGString(svg);
}

const PATHS = {
  // Lightning bolt - torch
  bolt: makePath('M13 2 L4 14 L11.5 14 L11 22 L20 10 L12.5 10 Z'),
  // Rotating ring around a lens - flip between front and back cameras
  flip: makePath(
    'M20.5 12 A8.5 8.5 0 1 1 18 6 M18.5 2 L18.5 6.5 L14 6.5 ' +
      'M12 9.6 A2.4 2.4 0 1 0 12 14.4 A2.4 2.4 0 1 0 12 9.6',
  ),
  // Arrow into a tray - save to device
  download: makePath('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3'),
  // Check mark - saved
  check: makePath('M20 6 L9 17 L4 12'),
  // Return arrow - retake
  refresh: makePath('M23 4 L23 10 L17 10 M20.49 15 A9 9 0 1 1 18.37 5.64 L23 10'),
  // Picture frame with hills and sun - pick from the library
  image: makePath(
    'M3 5.5 A1.5 1.5 0 0 1 4.5 4 L19.5 4 A1.5 1.5 0 0 1 21 5.5 L21 18.5 ' +
      'A1.5 1.5 0 0 1 19.5 20 L4.5 20 A1.5 1.5 0 0 1 3 18.5 Z ' +
      'M3 16 L8.5 10.5 L14 16 M13 15 L16.5 11.5 L21 16 ' +
      'M15.5 8.5 A1.2 1.2 0 1 0 15.5 8.4',
  ),
  // Funnel - filter by object class
  filter: makePath('M3 4.5 L21 4.5 L14 12.5 L14 20 L10 17.5 L10 12.5 Z'),
  // Chevron - expand/collapse (rotates 180° when open)
  chevron: makePath('M6 9.5 L12 15.5 L18 9.5'),
  // Reticle - confidence threshold
  target: makePath(
    'M12 3.5 A8.5 8.5 0 1 0 12 20.5 A8.5 8.5 0 1 0 12 3.5 ' +
      'M12 8.5 A3.5 3.5 0 1 0 12 15.5 A3.5 3.5 0 1 0 12 8.5',
  ),
  // Clock face with hands - scan history
  clock: makePath(
    'M12 3.5 A8.5 8.5 0 1 0 12 20.5 A8.5 8.5 0 1 0 12 3.5 M12 7.5 L12 12 L15.5 14',
  ),
  // Plus inside a circle - keep adding captures to a running total
  sum: makePath(
    'M12 3.5 A8.5 8.5 0 1 0 12 20.5 A8.5 8.5 0 1 0 12 3.5 M12 8 L12 16 M8 12 L16 12',
  ),
  // Cross - dismiss a row or close a panel
  close: makePath('M6 6 L18 18 M18 6 L6 18'),
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

  // The paths are drawn on a 24 grid, so scale down to the requested size.
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
