import { useEffect } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Path,
  Skia,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO } from '../shared/theme';

const ease = Easing.bezier(...EASE_OUT_EXPO);

// Everything below is authored in this square and scaled to the requested
// size by the outer Group, so the layout maths stays readable at one fixed
// grid instead of being multiplied through by hand.
const VIEWPORT = 108;
const CENTER = VIEWPORT / 2;

// Leaves a band between the tally mark and the canvas edge for the orbiting
// ring to live in, with nothing square boxing the mark in.
const RING_RADIUS = CENTER - 2;

const DRAW_MS = 480;
const GAP_MS = 110;
const RING_MS = 6400;

// The same shape as the launcher icon
// (res/drawable/ic_launcher_foreground.xml) so the OS splash hands over to
// LaunchScreen without a jolt.
const STROKES = [
  'M40 42 L40 66',
  'M49 42 L49 66',
  'M58 42 L58 66',
  'M67 42 L67 66',
];
const SLASH = 'M35 68 L72 40';

// The launcher paths were drawn to fill a bare canvas; inside a badge they
// need enlarging or they read as a small mark lost in a large tile. Scaled
// about their own centre (x spans 35..72, y spans 40..68) so the enlargement
// stays put rather than drifting toward the origin.
const TALLY_SCALE = 1.34;
const TALLY_ORIGIN = { x: 53.5, y: 54 };

/**
 * One tally stroke, drawing itself in on mount.
 *
 * `pxScale` is every scale between this path and the screen multiplied
 * together (the canvas scale and the tally's own enlargement). `strokeWidth`
 * divides it back out so the stroke lands at a fixed physical weight -
 * without it a bigger mark would draw proportionally fatter strokes instead
 * of the same weight at a bigger size.
 */
function Stroke({
  d,
  index,
  pxScale,
  progress,
  color,
}: {
  d: string;
  index: number;
  pxScale: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const path = Skia.Path.MakeFromSVGString(d);
  // Each stroke takes a slice of the shared progress, offset by GAP_MS.
  const total = GAP_MS * STROKES.length + DRAW_MS;
  const from = (index * GAP_MS) / total;
  const to = from + DRAW_MS / total;

  const end = useDerivedValue(() => {
    const t = (progress.value - from) / (to - from);
    return Math.min(1, Math.max(0, t));
  });

  if (path == null) return null;
  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={4.6 / pxScale}
      strokeCap="round"
      color={color}
      start={0}
      end={end}
    />
  );
}

/**
 * The app's wordmark: the tally strokes (four bars and a slash - literally a
 * tally count, which is what this app takes) floating free of any container,
 * with a comet of light orbiting around them.
 *
 * Three animations run at once, each carrying a different part of "modern and
 * alive": the mark springs in with a slight overshoot rather than fading in
 * flatly, the strokes trace themselves on right after, and the comet keeps
 * circling - one continuous, non-reversing lap after another - for as long as
 * the mark is on screen. Unlike the draw-once version this replaced, there is
 * no point at which it goes visually still, and nothing ever animates
 * backward toward where it started.
 *
 * Owns its whole animation lifecycle internally and replays the entrance
 * every time it mounts, so two screens showing this mark back to back
 * (LaunchScreen then AuthScreen, or the reverse) each get their own entrance
 * rather than picking up a shared, already-finished timeline.
 */
export function LogoMark({ size = 132 }: { size?: number }) {
  const scale = size / VIEWPORT;

  const pop = useSharedValue(0);
  const draw = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 11, stiffness: 140, mass: 0.6 });
    draw.value = withDelay(160, withTiming(1, { duration: 1050, easing: ease }));
    // Runs from the very first frame, independent of the entrance - the comet
    // is what keeps the mark from ever reading as a static icon. Each lap
    // restarts from 0 rather than reversing, so it always reads as one
    // continuous spin, never as a snap back to where it started.
    spin.value = withRepeat(
      withTiming(1, { duration: RING_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [pop, draw, spin]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.85 + 0.15 * pop.value }],
  }));

  const ringTransform = useDerivedValue(() => [
    { rotate: spin.value * Math.PI * 2 },
  ]);

  return (
    <Animated.View style={wrapStyle}>
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale }]}>
          {/* A comet of light orbiting the mark. The sweep is transparent for
              most of its turn and only brightens over the last stretch, so
              what reads on screen is a short arc chasing itself around rather
              than a full ring changing colour. */}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RING_RADIUS}
            style="stroke"
            strokeWidth={2.4 / scale}
            strokeCap="round"
            transform={ringTransform}
            origin={{ x: CENTER, y: CENTER }}
          >
            <SweepGradient
              c={vec(CENTER, CENTER)}
              colors={[
                'rgba(0,230,118,0)',
                'rgba(0,230,118,0)',
                COLORS.accent,
                'rgba(140,255,196,0)',
              ]}
              positions={[0, 0.62, 0.88, 1]}
            />
          </Circle>

          {/* The tally mark itself. */}
          <Group transform={[{ scale: TALLY_SCALE }]} origin={TALLY_ORIGIN}>
            {STROKES.map((d, i) => (
              <Stroke
                key={d}
                d={d}
                index={i}
                pxScale={scale * TALLY_SCALE}
                progress={draw}
                color={COLORS.accent}
              />
            ))}
            <Stroke
              d={SLASH}
              index={STROKES.length}
              pxScale={scale * TALLY_SCALE}
              progress={draw}
              color={COLORS.textPrimary}
            />
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
}
