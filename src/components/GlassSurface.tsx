import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';

import { BEZEL_PAD, BLUR, COLORS, RADIUS } from '../shared/theme';

interface Props {
  children: React.ReactNode;
  /** Bo tròn hoàn toàn thành viên thuốc thay vì thẻ bo góc. */
  pill?: boolean;
  /** Style cho vỏ ngoài (vị trí, kích thước). */
  style?: ViewStyle | ViewStyle[];
  /** Style cho lõi trong (padding nội dung). */
  contentStyle?: ViewStyle | ViewStyle[];
}

/**
 * Bề mặt kính 2 lớp (double-bezel): vỏ ngoài trong mờ ôm lấy lõi có blur thật.
 *
 * Bo góc đồng tâm: lõi trong = bán kính vỏ trừ đúng phần đệm, để hai đường cong
 * song song nhau. Để bằng nhau là lỗi thị giác dễ thấy nhất của thẻ lồng thẻ.
 */
export function GlassSurface({ children, pill, style, contentStyle }: Props) {
  const shellRadius = pill ? RADIUS.pillShell : RADIUS.shell;
  const coreRadius = pill ? RADIUS.pillShell : RADIUS.shell - BEZEL_PAD;

  return (
    <View style={[styles.shell, { borderRadius: shellRadius }, style]}>
      <View
        style={[styles.core, { borderRadius: coreRadius }, contentStyle]}
      >
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={BLUR.type}
          blurAmount={BLUR.amount}
          // Android mặc định phủ thêm một lớp màu lên trên blur - tắt đi để
          // tự kiểm soát độ đậm bằng backgroundColor của lõi.
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
    // Cắt lớp blur theo đúng góc bo, nếu không nó sẽ tràn ra thành hình vuông.
    overflow: 'hidden',
  },
});
