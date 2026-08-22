import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS } from '../shared/theme';
import { t } from '../i18n';
import type { Identity } from '../hooks/useFaceIdentity';
import type { Detection } from '../shared/detections';
import type { ScreenRect } from '../shared/boxLayout';

/** Thickness of the corner brackets. Heavier than the full rectangle it
 *  replaced: there is a quarter as much line left to carry the same weight. */
const STROKE = 3;

/** How far a bracket runs along each edge, as a fraction of the box's shorter
 *  side - clamped, so a distant face keeps recognisable corners and a close
 *  one does not grow brackets that meet in the middle and rebuild the box. */
const CORNER_RATIO = 0.28;
const CORNER_MIN = 12;
const CORNER_MAX = 30;

/**
 * How long a box takes to travel to a newly detected position.
 *
 * Detection runs a few times a second, so without this the box teleports: it
 * sits still for a few hundred milliseconds, jumps, sits still again. The face
 * underneath moved smoothly the whole time, and the eye reads the difference as
 * the app stuttering rather than the model being slow.
 *
 * Linear, not eased. An ease-out lands softly, which is right for something
 * arriving; this is something FOLLOWING, and constant speed is what reads as
 * tracking. Roughly one detection interval, so each glide finishes about when
 * the next box arrives - longer and the box lags visibly behind the face.
 *
 * POSITION ONLY, and that is the whole trick. This animated `left`, `top`,
 * `width` and `height` at first, which are layout properties: every animated
 * frame put the view through a layout pass, for every box on screen, sixty
 * times a second. `translateX`/`translateY` are transforms - the compositor
 * moves the finished view and no layout runs at all.
 *
 * Size is set outright and steps between detections. A face walking across the
 * room changes position by hundreds of pixels and its box size by a handful,
 * so the step is invisible next to the glide it is paying for.
 */
const GLIDE_MS = 220;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One face marker, following it: four corner brackets and the hit region that
 * opens the scan preview. No text at all.
 *
 * Brackets rather than a closed rectangle. A full outline around a face reads
 * as a border drawn ON the person - it competes with the face for attention and
 * boxes in the one part of the frame you actually want to look at. Corners say
 * the same thing (here, this size) while leaving the face itself uncovered,
 * which is why every camera viewfinder that has to frame something living uses
 * them.
 *
 * The label went the same way as the confidence figure before it. A viewfinder
 * with a caption stuck to every face is a screen you read instead of look at,
 * and the name was never urgent: the count says how many people are there, the
 * colour says whether this one is recognised, and tapping the marker opens the
 * scan preview that says who. Nothing was lost that was not one tap away.
 *
 * Which leaves the accessibility label as the ONLY place either fact is spelled
 * out - so it keeps both, and matters more than it did.
 */
function DetectionBoxInner({
  detection,
  rect,
  identity,
  onPress,
}: {
  detection: Detection;
  rect: ScreenRect;
  /** Who this face belongs to, once recognition has finished with it. */
  identity?: Identity;
  onPress: () => void;
}) {
  // Position is animated rather than rendered outright - see GLIDE_MS. The
  // shared values start AT the first rect so a box that has just appeared does
  // not fly in from wherever the previous one was.
  const x = useSharedValue(rect.left);
  const y = useSharedValue(rect.top);

  // Depending on the two NUMBERS, not on `rect`: the parent builds a fresh
  // rect object on every render, so `[rect]` restarted both animations several
  // times a second even when the box had not moved a pixel.
  useEffect(() => {
    const glide = { duration: GLIDE_MS, easing: Easing.linear };
    x.value = withTiming(rect.left, glide);
    y.value = withTiming(rect.top, glide);
  }, [rect.left, rect.top, x, y]);

  const move = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  // The colour is all that is left of recognition on this screen: accent for a
  // face the app can put a name to, amber for one it cannot. It says there is
  // something to see here, and the scan preview says what.
  const known = identity?.state === 'known';
  const color = known ? COLORS.accent : COLORS.warn;

  const arm = Math.max(
    CORNER_MIN,
    Math.min(CORNER_MAX, Math.min(rect.width, rect.height) * CORNER_RATIO),
  );
  const size = { width: arm, height: arm, borderColor: color };

  return (
    <AnimatedPressable
      style={[styles.box, { width: rect.width, height: rect.height }, move]}
      accessibilityRole="button"
      // Both the name and the confidence live here and nowhere else now. A
      // screen reader has no brackets to see and no colour to read them by, so
      // this is not a duplicate of the visuals - it is the whole of them.
      accessibilityLabel={
        known
          ? t('faceKnownLabel', { name: identity.displayName })
          : t('boxLabel', { percent: Math.round(detection.score * 100) })
      }
      accessibilityHint={t('boxHint')}
      onPress={onPress}
    >
      <View style={[styles.corner, styles.topLeft, size]} />
      <View style={[styles.corner, styles.topRight, size]} />
      <View style={[styles.corner, styles.bottomLeft, size]} />
      <View style={[styles.corner, styles.bottomRight, size]} />
    </AnimatedPressable>
  );
}

/**
 * Boxes are the one thing on this screen that legitimately changes several
 * times a second, so this memo is not about them: it is about every OTHER
 * render - a focus tap, a sheet opening, a settings toggle - not dragging the
 * boxes through a re-render with identical props.
 */
export const DetectionBox = React.memo(DetectionBoxInner);

const styles = StyleSheet.create({
  // No border of its own: the four children below are the whole marker, and
  // the box itself is only the hit region and the frame they hang off.
  box: { position: 'absolute', left: 0, top: 0 },

  corner: { position: 'absolute' },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: STROKE,
    borderLeftWidth: STROKE,
    borderTopLeftRadius: 5,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
    borderTopRightRadius: 5,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: STROKE,
    borderLeftWidth: STROKE,
    borderBottomLeftRadius: 5,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: STROKE,
    borderRightWidth: STROKE,
    borderBottomRightRadius: 5,
  },
});
