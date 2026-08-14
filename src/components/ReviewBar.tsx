import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, EASE_OUT_EXPO, FONT } from '../shared/theme';
import type { SaveState } from '../hooks/useSavePhoto';
import { GlassSurface } from './GlassSurface';
import { IconButton } from './IconButton';

const ease = Easing.bezier(...EASE_OUT_EXPO);

const SAVE_TEXT: Partial<Record<SaveState, string>> = {
  saving: 'Đang lưu…',
  saved: 'Đã lưu vào thư viện',
  error: 'Lưu thất bại, chạm để thử lại',
};

/**
 * The control bar while reviewing a scanned image: two small icon buttons rather
 * than the full-size shutter - by now the image is what wants looking at.
 */
export function ReviewBar({
  saveState,
  onRetake,
  onSave,
}: {
  saveState: SaveState;
  onRetake: () => void;
  onSave: () => void;
}) {
  const status = SAVE_TEXT[saveState];
  const statusIn = useSharedValue(0);

  useEffect(() => {
    statusIn.value = withTiming(status != null ? 1 : 0, {
      duration: 420,
      easing: ease,
    });
  }, [status, statusIn]);

  const statusStyle = useAnimatedStyle(() => ({
    opacity: statusIn.value,
    transform: [{ translateY: 6 * (1 - statusIn.value) }],
  }));

  return (
    <View style={styles.wrap}>
      {/* Reserve the status line's space so the button row cannot jump. */}
      <Animated.View style={[styles.statusSlot, statusStyle]}>
        <Text
          style={[styles.status, saveState === 'saved' && styles.statusDone]}
        >
          {status ?? ''}
        </Text>
      </Animated.View>

      <GlassSurface pill contentStyle={styles.row}>
        <IconButton name="refresh" label="Chụp lại" onPress={onRetake} />
        <View style={styles.divider} />
        <IconButton
          name={saveState === 'saved' ? 'check' : 'download'}
          label="Lưu ảnh đã gắn khung vào thư viện"
          active={saveState === 'saved'}
          disabled={saveState === 'saving' || saveState === 'saved'}
          onPress={onSave}
        />
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  statusSlot: { height: 15, justifyContent: 'center' },
  status: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 11,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statusDone: { color: COLORS.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: COLORS.hairline,
  },
});
