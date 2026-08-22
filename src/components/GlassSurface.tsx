import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';

import { BEZEL_PAD, BLUR, COLORS, RADIUS } from '../shared/theme';

interface Props {
  children: React.ReactNode;
  /** Fully round into a pill instead of a rounded card. */
  pill?: boolean;
  /** Style for the outer shell (position, size). */
  style?: ViewStyle | ViewStyle[];
  /** Style for the inner core (content padding). */
  contentStyle?: ViewStyle | ViewStyle[];
}

/**
 * A double-bezel glass surface: a translucent outer shell wrapping a core with
 * real blur.
 *
 * Concentric corners: the core's radius is the shell's minus exactly the padding,
 * so the two curves stay parallel. Leaving them equal is the most visible
 * giveaway of a card nested in a card.
 */
export function GlassSurface({ children, pill, style, contentStyle }: Props) {
  const shellRadius = pill ? RADIUS.pillShell : RADIUS.shell;
  const coreRadius = pill ? RADIUS.pillShell : RADIUS.shell - BEZEL_PAD;

  return (
    <View style={[styles.shell, { borderRadius: shellRadius }, style]}>
      <View style={[styles.core, { borderRadius: coreRadius }, contentStyle]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={BLUR.type}
          blurAmount={BLUR.amount}
          // Android lays an extra colour wash over the blur by default - turn
          // it off and control the depth with the core's backgroundColor.
          overlayColor="transparent"
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: COLORS.shell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    padding: BEZEL_PAD,
  },
  core: {
    backgroundColor: COLORS.core,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.coreHighlight,
    // Clip the blur to the corner radius, or it spills out square.
    overflow: 'hidden',
  },
});
