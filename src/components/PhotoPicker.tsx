import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Skia, type SkData } from '@shopify/react-native-skia';

import { COLORS, FONT } from '../theme';

const PAGE = 60;
const COLUMNS = 3;
const GAP = 2;

/**
 * Android 13 tách quyền đọc ảnh ra khỏi quyền đọc bộ nhớ chung; máy cũ hơn vẫn
 * phải xin READ_EXTERNAL_STORAGE. iOS để Photos framework tự hỏi lúc truy cập.
 *
 * Từ Android 14 người dùng có thể chỉ cho xem MỘT SỐ ảnh. Khi đó hệ thống vẫn
 * báo READ_MEDIA_IMAGES là "granted" (cờ REVOKED_COMPAT, để code cũ khỏi vỡ)
 * nhưng `getPhotos` chỉ trả về đúng những ảnh đã chọn - có thể là không ảnh
 * nào. Gọi lại hàm này sẽ mở lại bảng chọn để thêm ảnh.
 */
async function ensurePhotoPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permission =
    Number(Platform.Version) >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  const granted = await PermissionsAndroid.request(permission);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function asFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/**
 * Đường dẫn để HIỂN THỊ trong lưới. iOS trả 'ph://<id>' - định danh Photos,
 * không phải file - nhưng <Image> hiểu được nhờ handler camera-roll cài sẵn.
 */
function displayUri(image: { uri: string; filepath: string | null }): string {
  const path = image.filepath;
  if (path == null || path === '') return image.uri;
  return asFileUri(path);
}

/**
 * Đọc byte của ảnh đã chọn thành `SkData` để đưa cho Skia.
 *
 * `Skia.Data.fromURI` chỉ nạp được file/URL thật, mà picker lại trả về định
 * danh của kho ảnh hệ thống - và tệ hơn là nó **treo im lặng** với những URI đó
 * chứ không báo lỗi. Nên phải quy về byte trước:
 *
 * - Android: `content://…` đọc bằng `fetch` (tầng mạng của RN hiểu scheme này,
 *   cùng cơ chế giúp <Image> hiển thị được ảnh trong lưới).
 * - iOS: `ph://<id>` là định danh Photos, nhờ camera-roll ghi ra file tạm,
 *   tiện thể chuyển HEIC (mặc định của iPhone) sang JPEG.
 */
export async function loadImageData(uri: string): Promise<SkData> {
  if (uri.startsWith('ph://')) {
    const asset = await CameraRoll.iosGetImageDataById(uri, {
      convertHeicImages: true,
    });
    const path = asset.node.image.filepath;
    if (path == null || path === '') {
      throw new Error('không lấy được đường dẫn file của ảnh');
    }
    return Skia.Data.fromURI(asFileUri(path));
  }

  if (!uri.startsWith('content://')) return Skia.Data.fromURI(uri);

  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('không đọc được ảnh đã chọn'));
    reader.readAsDataURL(blob);
  });
  return Skia.Data.fromBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/** Lưới ảnh gần đây để chọn một tấm đem đi quét. */
export function PhotoPicker({
  onPick,
  onClose,
}: {
  onPick: (uri: string) => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [uris, setUris] = useState<string[] | null>(null);
  // Android 14+: người dùng chỉ cho xem một số ảnh, không phải cả thư viện.
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cell = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const load = useCallback(async () => {
    try {
      if (!(await ensurePhotoPermission())) {
        setError('Cần quyền đọc ảnh để chọn từ thư viện.');
        return;
      }
      const page = await CameraRoll.getPhotos({
        first: PAGE,
        assetType: 'Photos',
      });
      setUris(page.edges.map(e => displayUri(e.node.image)));
      setLimited(page.limited === true);
    } catch (e) {
      console.warn('[PhotoPicker] không đọc được thư viện ảnh', e);
      setError('Không đọc được thư viện ảnh.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Chọn ảnh</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            hitSlop={16}
            onPress={onClose}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {/* Chỉ được xem một phần thư viện: phải có lối mở lại bảng chọn, không
            thì người dùng kẹt hẳn khi lỡ không chọn ảnh nào. */}
        {limited && uris != null && uris.length > 0 && (
          <Pressable style={styles.notice} onPress={load}>
            <Text style={styles.noticeText}>
              Chỉ thấy {uris.length} ảnh bạn đã cho phép · Chọn thêm
            </Text>
          </Pressable>
        )}

        {error != null ? (
          <View style={styles.center}>
            <Text style={styles.message}>{error}</Text>
          </View>
        ) : uris == null ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : uris.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.message}>
              {limited
                ? 'Bạn chưa cho ứng dụng xem ảnh nào.'
                : 'Thư viện chưa có ảnh nào.'}
            </Text>
            {limited && (
              <Pressable style={styles.cta} onPress={load}>
                <Text style={styles.ctaText}>Chọn ảnh cho phép</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={uris}
            keyExtractor={uri => uri}
            numColumns={COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={{ paddingBottom: insets.bottom }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel="Quét ảnh này"
                onPress={() => onPick(item)}
              >
                <Image
                  source={{ uri: item }}
                  style={{ width: cell, height: cell }}
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  close: { color: COLORS.textMuted, fontFamily: FONT.medium, fontSize: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 20,
  },
  notice: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  noticeText: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 12,
  },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  ctaText: { color: '#04120A', fontFamily: FONT.semibold, fontSize: 14 },
  message: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  gridRow: { gap: GAP, marginBottom: GAP },
});
