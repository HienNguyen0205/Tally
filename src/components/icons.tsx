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
  // Cross - dismiss a panel. Only for surfaces outside an RN Modal (currently
  // DetailSheet); anything inside one draws blank on Android and takes
  // modalIcons' View-built CloseIcon instead, which mirrors this same shape.
  close: makePath('M6 6 L18 18 M18 6 L6 18'),
  // Open eye - password is showing
  eye: makePath(
    'M2 12 C4.8 7.4 8.3 5 12 5 C15.7 5 19.2 7.4 22 12 ' +
      'C19.2 16.6 15.7 19 12 19 C8.3 19 4.8 16.6 2 12 Z ' +
      'M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9',
  ),
  // Struck-through eye - password is hidden. The two arcs stop short of the
  // slash rather than running under it, so the cut reads as a gap, not an
  // overlap.
  eyeOff: makePath(
    'M10.7 6.2 A9.4 9.4 0 0 1 12 6.1 C15.7 6.1 19.2 8.5 22 12 ' +
      'A18.6 18.6 0 0 1 18.9 15.3 M14.8 16.6 A9.6 9.6 0 0 1 12 17.9 ' +
      'C8.3 17.9 4.8 15.5 2 12 A18.4 18.4 0 0 1 5.6 8.2 ' +
      'M9.9 9.9 A3 3 0 0 0 14.1 14.1 M4 4 L20 20',
  ),
  // Three sliders at different positions - the settings screen entry point.
  // Each knob is a small ring drawn as two half-circle arcs, the same trick
  // 'sum' and 'target' use, so a stroke-only path still reads as a filled dot.
  settings: makePath(
    'M3 6 L21 6 M15 3.6 A2.4 2.4 0 1 0 15 8.4 A2.4 2.4 0 1 0 15 3.6 ' +
      'M3 12 L21 12 M9 9.6 A2.4 2.4 0 1 0 9 14.4 A2.4 2.4 0 1 0 9 9.6 ' +
      'M3 18 L21 18 M16 15.6 A2.4 2.4 0 1 0 16 20.4 A2.4 2.4 0 1 0 16 15.6',
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
