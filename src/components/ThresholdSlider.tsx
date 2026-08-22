import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import { t } from '../i18n';
import { Icon } from './icons';

/** Track width when the slider sizes itself - see the `fill` prop. */
const TRACK_W = 104;
const KNOB = 18;
const MIN = 0.2;
const MAX = 0.9;
const ease = Easing.bezier(...EASE_OUT_EXPO);

interface Props {
  value: number;
  onChange: (v: number) => void;
  /**
   * The leading target icon is Skia - blank inside an RN `Modal` on Android
   * (see modalIcons.tsx). SettingsScreen renders this inside one, so it opts
   * out rather than shipping an invisible icon that still eats layout space.
   */
  showIcon?: boolean;
  /**
   * Whether `onChange` fires continuously during the drag, or once on
   * release.
   *
   * DetectorScreen needs it live: its `onChange` is a plain `setThreshold`
   * and the boxes re-filter as the finger moves. SettingsScreen does not -
   * there this is a stored default for the *next* session, and its
   * `onChange` runs `settings.update`, which writes MMKV and re-renders from
   * App.tsx down (DetectorScreen, camera and Skia canvases included). Doing
   * that once per percentage point is ~70 full-tree re-renders per drag on
   * the JS thread, which is what stops the knob keeping up with the finger.
   */
  live?: boolean;
  /**
   * Stretch the track across whatever width the parent gives, instead of the
   * fixed TRACK_W.
   *
   * For the tool pill in DetectorScreen the fixed width is right - it sits in
   * a row of buttons that must stay intrinsically sized. SettingsScreen's row
   * is a full-width column (see `stacked` there), where 104dp leaves the track
   * marooned in a third of the row and gives the 0.2..0.9 range only ~86dp of
   * travel, about 1.2dp per percentage point.
   *
   * The width is measured rather than passed in: a number picked to fill a
   * 393dp screen would overflow a 320dp one, and it has to survive rotation.
   */
  fill?: boolean;
}

/**
 * Confidence threshold slider - dragged directly rather than cycled by tapping.
 *
 * Uses RN core's PanResponder (the project has no gesture-handler). The gesture
 * runs on the JS thread but only writes a shared value; Reanimated does the
 * drawing on the UI thread, so it stays smooth.
 */
/** Threshold (0.2..0.9) -> position along the track (0..1). */
function toProgress(value: number): number {
  return (value - MIN) / (MAX - MIN);
}

export function ThresholdSlider({
  value,
  onChange,
  showIcon = true,
  live = true,
  fill = false,
}: Props) {
  const progress = useSharedValue(toProgress(value));

  // How far the knob can move: the track's own width less the knob, so the
  // knob's right edge stops at the track's. Two copies on purpose - a shared
  // value the knob's animated style can react to on the UI thread, and a ref
  // the pan handlers read on the JS thread. Neither is state: re-rendering on
  // layout would be pointless, and putting it in `pan`'s deps would rebuild
  // the PanResponder, which is exactly the stutter fixed earlier.
  const travelSV = useSharedValue(TRACK_W - KNOB);
  const travel = useRef(TRACK_W - KNOB);

  const onTrackLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (!fill) return;
      // Never zero: a zero divisor in onPanResponderMove turns every drag into
      // Infinity and pins the knob to one end.
      const next = Math.max(1, e.nativeEvent.layout.width - KNOB);
      travel.current = next;
      travelSV.value = next;
    },
    [fill, travelSV],
  );
  // The value at drag start, so finger travel accumulates onto it. Derived from
  // the prop rather than read off progress.value: a useRef argument evaluates on
  // every render, and reading a shared value mid-render is exactly what
  // Reanimated warns about.
  const startProgress = useRef(toProgress(value));
  const grabbed = useSharedValue(0);

  // SettingsScreen passes a fresh `onChange` closure every render (it calls
  // settings.update inline), and settings.update itself triggers that
  // re-render - so depending on `onChange` directly would rebuild `pan` on
  // every drag tick. A new PanResponder mid-gesture never received the
  // onResponderGrant that started the touch, so its gesture-state baseline
  // is wrong on the next move - which is what read as stutter. Reading the
  // latest callback through a ref keeps `pan` stable across the whole drag.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Shown instead of the `value` prop directly, so the number on screen
  // tracks the finger every move event instead of waiting on the round trip
  // through the parent below (which persists to MMKV and re-renders the
  // whole app tree, not just this slider).
  const [percent, setPercent] = useState(() => Math.round(value * 100));
  // That round trip was also firing on every move event even when the
  // rounded percent hadn't actually changed - most moves land in the same 1%
  // bucket as the last one - which was the rest of what read as stutter.
  // Committing only on a real change cuts it down to ~1 per percentage point.
  const lastCommittedPercent = useRef(percent);
  // Where the drag has actually got to, for the single commit a non-live
  // slider makes on release.
  const pendingPercent = useRef(percent);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  // Flushes whatever the drag ended on. A live slider has already committed
  // it during the move, so this is a no-op there; a non-live one commits
  // exactly once here, which is the whole point of the mode.
  const commitPending = useCallback(() => {
    if (pendingPercent.current === lastCommittedPercent.current) return;
    lastCommittedPercent.current = pendingPercent.current;
    onChangeRef.current(pendingPercent.current / 100);
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startProgress.current = progress.value;
          grabbed.value = withTiming(1, { duration: 160, easing: ease });
        },
        onPanResponderMove: (_, g) => {
          const next = clamp(startProgress.current + g.dx / travel.current);
          progress.value = next;
          const pct = Math.round((MIN + next * (MAX - MIN)) * 100);
          setPercent(pct);
          pendingPercent.current = pct;
          if (live && pct !== lastCommittedPercent.current) {
            lastCommittedPercent.current = pct;
            onChangeRef.current(pct / 100);
          }
        },
        onPanResponderRelease: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
          commitPending();
        },
        onPanResponderTerminate: () => {
          grabbed.value = withTiming(0, { duration: 320, easing: ease });
          commitPending();
        },
      }),
    [grabbed, progress, live, commitPending],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * travelSV.value },
      { scale: 1 + 0.25 * grabbed.value },
    ],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  // A drag is unusable with a screen reader on. Declaring the row adjustable
  // gives it the standard swipe-up/down gestures, and the actions below map
  // those onto the same 5% steps a sighted user gets from small drags.
  const step = useCallback(
    (delta: number) => {
      const next = clamp(toProgress(value) + delta);
      progress.value = withTiming(next, { duration: 120, easing: ease });
      const pct = Math.round((MIN + next * (MAX - MIN)) * 100);
      setPercent(pct);
      // A screen-reader step is a discrete action, not a drag, so it commits
      // straight away in both modes.
      pendingPercent.current = pct;
      lastCommittedPercent.current = pct;
      onChangeRef.current(pct / 100);
    },
    [value, progress],
  );

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('thresholdLabel')}
      accessibilityHint={t('thresholdHint')}
      accessibilityValue={{
        min: Math.round(MIN * 100),
        max: Math.round(MAX * 100),
        now: percent,
        text: t('percent', { n: percent }),
      }}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'increment') step(0.05);
        if (e.nativeEvent.actionName === 'decrement') step(-0.05);
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      {...pan.panHandlers}
    >
      {showIcon && (
        <Icon
          name="target"
          size={15}
          color={COLORS.textMuted}
          strokeWidth={1.5}
        />
      )}

      <View
        style={[styles.track, fill ? styles.trackFill : styles.trackFixed]}
        onLayout={onTrackLayout}
      >
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.knob, knobStyle]} />
      </View>

      <Text style={styles.value}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  trackFixed: { width: TRACK_W },
  // The row is only as wide as the parent allows, so this takes what is left
  // after the icon, the gap and the percentage readout.
  trackFill: { flex: 1 },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    // Scale from the left edge rather than the centre.
    transformOrigin: 'left',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fff',
  },
  value: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 12,
    minWidth: 34,
    textAlign: 'right',
  },
});
