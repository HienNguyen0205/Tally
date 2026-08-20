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

/**
 * A centred X, two crossed bars.
 *
 * Geometry is taken from `icons.tsx`'s Skia `close` glyph ('M6 6 L18 18
 * M18 6 L6 18' on a 24 grid) so the two draw the same shape: each bar spans
 * hypot(12,12) = 17 of 24 units, hence the 0.707 length factor. The old 0.6
 * drew a noticeably stubbier X than the Skia one, which - along with the
 * dimmer textMuted colour it used to default to - is what read as small and
 * faint rather than crisp.
 */
export function CloseIcon({
  size = 28,
  color = COLORS.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(2.2, size * 0.1);
  const len = size * 0.707;
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
