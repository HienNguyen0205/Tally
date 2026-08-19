import React from 'react';
import { View } from 'react-native';

import { COLORS } from '../shared/theme';

/**
 * Plain-View icons, for use inside an RN `Modal`.
 *
 * A Skia `<Canvas>` (see icons.tsx) draws nothing inside a Modal on Android -
 * the Modal gets its own window and surface, and every Skia icon in one
 * renders blank. HistorySheet and SettingsScreen are both Modals, so anything
 * they need lives here instead, built from Views the same way Checkbox
 * already is.
 */

/** A centred X, two crossed bars. */
export function CloseIcon({
  size = 20,
  color = COLORS.textMuted,
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(1.6, size * 0.1);
  const len = size * 0.6;
  const bar = (deg: number) => ({
    position: 'absolute' as const,
    width: len,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
    left: size / 2 - len / 2,
    top: size / 2 - stroke / 2,
    transform: [{ rotate: `${deg}deg` }],
  });
  return (
    <View style={{ width: size, height: size }}>
      <View style={bar(45)} />
      <View style={bar(-45)} />
    </View>
  );
}
