import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT } from '../shared/theme';
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
  // One colour, because there is one class. The old green/amber split marked
  // people apart from everything else; with a face detector every box is the
  // thing being counted.
  const color = COLORS.accent;
  const percent = Math.round(detection.score * 100);

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
      accessibilityLabel={t('boxLabel', { percent })}
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
        {/* Just the score: the class name was worth the pixels when it could
            be any of 80 things, but "face 87%" on every box of a face
            detector spends half the chip saying what the whole screen
            already says. */}
        <Text style={styles.chipText} numberOfLines={1}>
          {percent}%
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
