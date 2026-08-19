import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, RadialGradient, vec } from '@shopify/react-native-skia';

interface Props {
  width: number;
  height: number;
}

/**
 * Two soft orbs behind a screen that has no camera under it.
 *
 * Drawn once and never animated, so it costs one Skia frame. A gradient rather
 * than a flat fill is what stops the deep background reading as an empty black
 * rectangle - on OLED there is otherwise nothing at all to see behind the
 * content.
 */
export function AmbientBackdrop({ width, height }: Props) {
  // Sized off the long edge so it scales with the device, but kept well under
  // it: a radius near the screen's own size spreads the falloff so far that the
  // orb stops reading as an orb and just tints everything.
  const glow = Math.max(width, height) * 0.55;
  const accent = { x: width * 0.18, y: height * 0.12 };
  const warm = { x: width * 0.92, y: height * 0.88 };

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={accent.x} cy={accent.y} r={glow}>
        <RadialGradient
          c={vec(accent.x, accent.y)}
          r={glow}
          colors={['rgba(0,230,118,0.16)', 'rgba(0,230,118,0)']}
        />
      </Circle>
      <Circle cx={warm.x} cy={warm.y} r={glow * 0.8}>
        <RadialGradient
          c={vec(warm.x, warm.y)}
          r={glow * 0.8}
          colors={['rgba(255,196,0,0.07)', 'rgba(255,196,0,0)']}
        />
      </Circle>
    </Canvas>
  );
}
