import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT } from '../shared/theme';
import { PERSON_CLASS_ID } from '../shared/constants';
import { label } from '../shared/labels';
import { t } from '../i18n';
import type { Detection } from '../shared/detections';
import type { ScreenRect } from '../shared/boxLayout';

const CHIP_H = 20;

/**
 * One box over a scanned image: coloured outline, label, and the hit region that
 * opens the detail sheet. Drawn as Views rather than burned into the image, so
 * changing the threshold shows/hides instantly; the burn-in happens only at save
 * time (`src/detection/annotate.ts`).
 */
export function DetectionBox({
  detection,
  rect,
  selected,
  onPress,
}: {
  detection: Detection;
  rect: ScreenRect;
  selected: boolean;
  onPress: () => void;
}) {
  const isPerson = detection.classId === PERSON_CLASS_ID;
  const color = isPerson ? COLORS.accent : COLORS.warn;
  const percent = Math.round(detection.score * 100);
  const name = label(detection.classId);

  // The label sits above the box; if the box hugs the top of the screen, flip it
  // down inside instead.
  const chipAbove = rect.top >= CHIP_H;

  return (
    <Pressable
      style={[
        styles.box,
        {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderColor: color,
        },
        selected && styles.boxSelected,
      ]}
      accessibilityRole="button"
      // The label names the thing; what happens on activation belongs in the
      // hint, which a screen reader reads separately and users can switch off.
      accessibilityLabel={t('boxLabel', { name, percent })}
      accessibilityHint={t('boxHint')}
      onPress={onPress}
    >
      <View
        style={[
          styles.chip,
          { backgroundColor: color },
          chipAbove ? styles.chipAbove : styles.chipInside,
        ]}
      >
        <Text style={styles.chipText} numberOfLines={1}>
          {name} {percent}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderWidth: 2 },
  boxSelected: { borderWidth: 3 },
  chip: {
    position: 'absolute',
    // Overhang by exactly the border width so the label's left edge lines up
    // with the box's.
    left: -2,
    height: CHIP_H,
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chipAbove: { top: -CHIP_H },
  chipInside: { top: 0 },
  chipText: {
    color: '#000',
    fontFamily: FONT.semibold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
