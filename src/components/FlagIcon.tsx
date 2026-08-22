import {
  Canvas,
  Fill,
  Group,
  Line,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import type { Locale } from '../i18n';

interface Props {
  locale: Locale;
  /** Both the canvas size and the circle's diameter - the flag always fills
   *  it edge to edge. */
  size: number;
}

/** A 5-pointed star, point up, as an SVG path string. */
function starPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${points.join(' ')}Z`;
}

/**
 * A country flag drawn with Skia, clipped to a circle that fills the whole
 * `size x size` box - not the OS's flag emoji, whose glyph is always a small
 * rectangle sitting inside whatever padding the font gives it. Scaling that
 * glyph up scales the rectangle and the padding around it together, never
 * fills a circular button edge to edge, which is exactly the problem this
 * replaces (see the language button in AuthScreen).
 *
 * Only the two locales this app ships need a flag, so a `locale in` switch is
 * enough - no lookup table to keep in sync with a country list nobody asked
 * for yet.
 */
export function FlagIcon({ locale, size }: Props) {
  const r = size / 2;
  // Skia.Path.Circle, not Make().addCircle() - every mutating SkPath builder
  // is deprecated in react-native-skia 2.11 and warns to the console.
  const clip = Skia.Path.Circle(r, r, r);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group clip={clip}>
        {locale === 'vi' ? (
          <>
            <Fill color="#DA251D" />
            <Path
              path={starPath(r, r, size * 0.3, size * 0.115)}
              color="#FFCD00"
            />
          </>
        ) : (
          <>
            <Fill color="#012169" />
            {/* St Andrew's cross (white), then St Patrick's cross (red)
                on top - both simplified to centred diagonals rather than
                the counterchanged stripes a full-size Union Jack uses,
                which does not read at 19-40px anyway. */}
            <Line
              p1={vec(0, 0)}
              p2={vec(size, size)}
              color="#FFFFFF"
              strokeWidth={size * 0.24}
            />
            <Line
              p1={vec(size, 0)}
              p2={vec(0, size)}
              color="#FFFFFF"
              strokeWidth={size * 0.24}
            />
            <Line
              p1={vec(0, 0)}
              p2={vec(size, size)}
              color="#C8102E"
              strokeWidth={size * 0.09}
            />
            <Line
              p1={vec(size, 0)}
              p2={vec(0, size)}
              color="#C8102E"
              strokeWidth={size * 0.09}
            />
            {/* St George's cross: white field, red cross, both straight. */}
            <Line
              p1={vec(r, 0)}
              p2={vec(r, size)}
              color="#FFFFFF"
              strokeWidth={size * 0.34}
            />
            <Line
              p1={vec(0, r)}
              p2={vec(size, r)}
              color="#FFFFFF"
              strokeWidth={size * 0.34}
            />
            <Line
              p1={vec(r, 0)}
              p2={vec(r, size)}
              color="#C8102E"
              strokeWidth={size * 0.14}
            />
            <Line
              p1={vec(0, r)}
              p2={vec(size, r)}
              color="#C8102E"
              strokeWidth={size * 0.14}
            />
          </>
        )}
      </Group>
    </Canvas>
  );
}
