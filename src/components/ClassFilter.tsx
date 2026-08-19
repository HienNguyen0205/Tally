import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { PERSON_CLASS_ID } from '../shared/constants';
import { label } from '../shared/labels';
import { t } from '../i18n';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons';

const ease = Easing.bezier(...EASE_OUT_EXPO);

export interface ClassCount {
  classId: number;
  count: number;
}

/**
 * Filter by object class: collapsed into a summary pill, tapped to reveal the
 * chip panel. The chips cover only the classes present in the image, not all of
 * COCO.
 *
 * This filters the display, like the threshold slider - the model already
 * scanned everything.
 *
 * The chip panel is its OWN surface floating above, not shared with the pill:
 * on one surface the chip row keeps stretching the width even while closed, so
 * collapsing leaves it just as wide.
 */
export function ClassFilter({
  counts,
  hidden,
  onToggle,
}: {
  counts: ClassCount[];
  hidden: ReadonlySet<number>;
  onToggle: (classId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const reveal = useSharedValue(0);

  useEffect(() => {
    reveal.value = 0;
    if (open) reveal.value = withTiming(1, { duration: 420, easing: ease });
  }, [open, reveal]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: 10 * (1 - reveal.value) },
      { scale: 0.97 + 0.03 * reveal.value },
    ],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${180 * reveal.value}deg` }],
  }));

  if (counts.length === 0) return null;

  const shown = counts.length - hidden.size;
  const summary =
    hidden.size === 0
      ? t('classCount', { count: counts.length })
      : t('classCountPartial', { shown, count: counts.length });

  return (
    <View style={styles.wrap}>
      {open && (
        <Animated.View style={panelStyle}>
          <GlassSurface contentStyle={styles.panelCore}>
            <View style={styles.row}>
              {counts.map(({ classId, count }) => {
                const off = hidden.has(classId);
                const color =
                  classId === PERSON_CLASS_ID ? COLORS.accent : COLORS.warn;
                const name = label(classId);

                return (
                  <Pressable
                    key={classId}
                    style={[styles.chip, off && styles.chipOff]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !off }}
                    accessibilityLabel={t('classChip', { name, count })}
                    accessibilityHint={t('classChipHint')}
                    onPress={() => onToggle(classId)}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: color },
                        off && styles.dotOff,
                      ]}
                    />
                    <Text style={[styles.name, off && styles.textOff]}>
                      {name}
                    </Text>
                    <Text style={[styles.count, off && styles.textOff]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassSurface>
        </Animated.View>
      )}

      <GlassSurface pill contentStyle={styles.headerCore}>
        <Pressable
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={
            open ? t('collapseFilter') : t('expandFilter')
          }
          onPress={() => setOpen(o => !o)}
        >
          <Icon
            name="filter"
            size={13}
            // Lit while filtering, so a collapsed pill still shows that
            // something is hidden.
            color={hidden.size === 0 ? COLORS.textMuted : COLORS.accent}
            strokeWidth={1.6}
          />
          <Text style={styles.summary}>{summary}</Text>
          <Animated.View style={chevronStyle}>
            <Icon
              name="chevron"
              size={13}
              color={COLORS.textFaint}
              strokeWidth={1.6}
            />
          </Animated.View>
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cap the width here so chips wrap instead of running off the screen edge.
  wrap: { alignItems: 'center', gap: 8, maxWidth: '92%' },

  headerCore: { paddingHorizontal: 6, paddingVertical: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  summary: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  panelCore: { padding: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    // Hug the full name; when space runs out the whole chip wraps rather than
    // being squeezed and truncated.
    flexShrink: 0,
  },
  chipOff: { backgroundColor: 'transparent' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOff: { opacity: 0.3 },
  name: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  count: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
  },
  textOff: { color: COLORS.textFaint },
});
