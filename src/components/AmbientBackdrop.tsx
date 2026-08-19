import { StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface Props {
  width: number;
  height: number;
}

/** One orb: drifts slowly along a small ellipse and breathes in radius, each
 *  on its own period so the two never fall into a visible unison. */
function useOrbit(periodMs: number, phase: number) {
  const t = useSharedValue(phase);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(phase + 1, { duration: periodMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [t, periodMs, phase]);
  return t;
}

/**
 * Two soft orbs behind a screen that has no camera under it, adrift and
 * breathing rather than a still gradient.
 *
 * Continuous but slow (18-26s per lap) and small (a few percent of the
 * screen) on purpose - this sits behind form fields someone is reading and
 * typing into, so it has to register as "alive" in peripheral vision without
 * ever competing for attention.
 */
export function AmbientBackdrop({ width, height }: Props) {
  // Sized off the long edge so it scales with the device, but kept well under
  // it: a radius near the screen's own size spreads the falloff so far that the
  // orb stops reading as an orb and just tints everything.
  const glow = Math.max(width, height) * 0.55;
  const accent = { x: width * 0.18, y: height * 0.12 };
  const warm = { x: width * 0.92, y: height * 0.88 };

  const driftA = useOrbit(22000, 0);
  const driftB = useOrbit(26000, 0.4);
  const breathe = useOrbit(9000, 0);

  const ampX = width * 0.05;
  const ampY = height * 0.035;

  const accentCenter = useDerivedValue(() =>
    vec(
      accent.x + Math.sin(driftA.value * Math.PI * 2) * ampX,
      accent.y + Math.cos(driftA.value * Math.PI * 2) * ampY,
    ),
  );
  const warmCenter = useDerivedValue(() =>
    vec(
      warm.x + Math.sin(driftB.value * Math.PI * 2 + Math.PI) * ampX,
      warm.y + Math.cos(driftB.value * Math.PI * 2 + Math.PI) * ampY,
    ),
  );
  // Breathes between 88% and 100% of `glow` - a visible pulse without ever
  // shrinking enough to look like it flickered off.
  const accentRadius = useDerivedValue(
    () => glow * (0.94 + 0.06 * Math.sin(breathe.value * Math.PI * 2)),
  );
  const warmRadius = useDerivedValue(
    () => glow * 0.8 * (0.94 - 0.06 * Math.sin(breathe.value * Math.PI * 2)),
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle c={accentCenter} r={accentRadius}>
        <RadialGradient
          c={accentCenter}
          r={accentRadius}
          colors={['rgba(0,230,118,0.17)', 'rgba(0,230,118,0)']}
        />
      </Circle>
      <Circle c={warmCenter} r={warmRadius}>
        <RadialGradient
          c={warmCenter}
          r={warmRadius}
          colors={['rgba(255,196,0,0.08)', 'rgba(255,196,0,0)']}
        />
      </Circle>
    </Canvas>
  );
}
