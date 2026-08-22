import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  BlurMask,
  Canvas,
  Fill,
  Group,
  Path,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { COLORS } from '../shared/theme';

// One lap of the comet. Faster while a face is actually being read, so the
// wait has a pulse to it rather than the same idle drift.
const IDLE_MS = 5200;
const BUSY_MS = 1500;

/** How dark everything outside the oval goes. The face itself stays at full
 *  camera brightness - the whole job of this layer is to say "here". */
const SCRIM = 'rgba(0,0,0,0.66)';

export type GuideState = 'idle' | 'working' | 'done';

/**
 * The face frame: a spotlight cut out of a dimmed frame, with a ring of light
 * running round its edge.
 *
 * A hole in the scrim rather than an outline drawn on top of an evenly dimmed
 * picture - the eye goes to the brightest thing on screen, so the bright thing
 * has to be the place the face goes. Skia does the cut (`invertClip`), which
 * no arrangement of React Native views can: a View can only darken a
 * rectangle, never a rectangle with an oval missing.
 *
 * The ring is one continuous non-reversing lap, the same choice LogoMark
 * makes: a sweep that reversed would read as the animation giving up and
 * going home. It never stops while this is on screen, so the frame never
 * looks frozen while you hold still in front of it.
 */
export function FaceGuide({ state }: { state: GuideState }) {
  const { width, height } = useWindowDimensions();

  // Off the short edge, capped against the tall one: a percentage of width
  // alone turns into a full-height ellipse on a narrow phone and a squashed
  // one in landscape.
  //
  // Measured against the copy above it rather than picked for looks - at
  // 0.46 of the height the oval reached up under the body text, and a bright
  // spotlight behind grey type is the one background that type cannot be read
  // on. Sitting lower and slightly rounder clears the block in both
  // languages, Vietnamese being the longer of the two.
  const rx = Math.min(width * 0.34, height * 0.19);
  const ry = rx / 0.82;
  const cx = width / 2;
  const cy = height * 0.52;

  const oval = useMemo(
    // Skia.Path.Oval, not Make().addOval() - the latter is deprecated in
    // react-native-skia 2.11 and warns on every render.
    () => Skia.Path.Oval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2)),
    [cx, cy, rx, ry],
  );

  const spin = useSharedValue(0);
  useEffect(() => {
    // Restarted rather than retimed: Reanimated has no way to change a running
    // animation's duration in place, and a lap that changed speed mid-turn
    // would stutter at the seam anyway.
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(1, {
        duration: state === 'working' ? BUSY_MS : IDLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [spin, state]);

  const turn = useDerivedValue(() => [{ rotate: spin.value * Math.PI * 2 }]);

  const done = state === 'done';
  // Done stops chasing and simply holds the ring lit: the comet is a "still
  // working" signal, and leaving it running past the end says the opposite of
  // what the tick underneath it says.
  const sweep = done
    ? [COLORS.accent, COLORS.accent]
    : [
        'rgba(0,230,118,0)',
        'rgba(0,230,118,0)',
        COLORS.accent,
        'rgba(140,255,196,0)',
      ];
  const sweepStops = done ? [0, 1] : [0, 0.55, 0.86, 1];

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group clip={oval} invertClip>
        <Fill color={SCRIM} />
      </Group>

      {/* The rail the light runs on. Hairline and cool, so the accent reads as
          light travelling over an edge rather than the edge itself changing
          colour. */}
      <Path
        path={oval}
        style="stroke"
        strokeWidth={1.5}
        color="rgba(255,255,255,0.22)"
      />

      {/* Bloom first, sharp ring over it - a blurred copy underneath is how
          this gets a glow without a drop shadow anywhere near it.

          The turn goes on the gradient, NOT on a Group around the paths. A
          Group rotates the geometry, and rotating an ellipse that is taller
          than it is wide swings the shape itself off the rail underneath it -
          which is exactly what the light was doing, drifting away from the
          edge and back twice a lap. Rotating the shader instead leaves the
          ellipse where it is and moves only the colour around it. */}
      <Path path={oval} style="stroke" strokeWidth={7} opacity={0.5}>
        <BlurMask blur={14} style="normal" />
        <SweepGradient
          c={vec(cx, cy)}
          colors={sweep}
          positions={sweepStops}
          origin={vec(cx, cy)}
          transform={turn}
        />
      </Path>
      <Path path={oval} style="stroke" strokeWidth={2.6} strokeCap="round">
        <SweepGradient
          c={vec(cx, cy)}
          colors={sweep}
          positions={sweepStops}
          origin={vec(cx, cy)}
          transform={turn}
        />
      </Path>
    </Canvas>
  );
}
