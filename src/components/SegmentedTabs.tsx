import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  BEZEL_PAD,
  COLORS,
  EASE_OUT_EXPO,
  FONT,
  RADIUS,
} from '../shared/theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props<T extends string> {
  /** Exactly two segments - the indicator maths assumes halves. */
  options: readonly [{ value: T; label: string }, { value: T; label: string }];
  selected: T;
  onSelect: (value: T) => void;
}

/**
 * A two-up segmented control whose indicator slides between the segments.
 *
 * The indicator is one absolutely positioned view moved with `translateX`
 * rather than a background swapped between two segments: sliding is the part
 * that reads as a physical control, and translating a single view animates on
 * the GPU instead of repainting two.
 *
 * Its width comes from `onLayout` because the row itself is fluid - there is no
 * fixed width to divide up front.
 */
export function SegmentedTabs<T extends string>({
  options,
  selected,
  onSelect,
}: Props<T>) {
  const [rowW, setRowW] = useState(0);
  const segmentW = rowW === 0 ? 0 : (rowW - BEZEL_PAD * 2) / 2;

  const slide = useSharedValue(0);
  const index = selected === options[1].value ? 1 : 0;
  useEffect(() => {
    slide.value = withTiming(index, { duration: 460, easing: ease });
  }, [index, slide]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * segmentW }],
  }));

  return (
    <View
      style={styles.shell}
      onLayout={e => setRowW(e.nativeEvent.layout.width)}
    >
      {segmentW > 0 && (
        <Animated.View
          style={[styles.indicator, { width: segmentW }, indicatorStyle]}
          pointerEvents="none"
        />
      )}
      {options.map((option, i) => (
        <Segment
          key={option.value}
          label={option.label}
          // Distance from this segment to the indicator: 0 when it is under it.
          progress={slide}
          position={i}
          selected={selected === option.value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

/** One segment. Its label colour tracks the indicator instead of flipping, so
 *  the text and the thing behind it move as one. */
function Segment({
  label,
  progress,
  position,
  selected,
  onPress,
}: {
  label: string;
  progress: { value: number };
  position: number;
  selected: boolean;
  onPress: () => void;
}) {
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      Math.abs(progress.value - position),
      [0, 1],
      [COLORS.onAccent, COLORS.textMuted],
    ),
  }));

  return (
    <Pressable
      style={styles.segment}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <Animated.Text style={[styles.segmentText, textStyle]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    borderRadius: RADIUS.pillShell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.shell,
    padding: BEZEL_PAD,
  },
  indicator: {
    position: 'absolute',
    top: BEZEL_PAD,
    left: BEZEL_PAD,
    bottom: BEZEL_PAD,
    borderRadius: RADIUS.pillShell,
    backgroundColor: COLORS.accent,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  segmentText: { fontFamily: FONT.semibold, fontSize: 14 },
});
