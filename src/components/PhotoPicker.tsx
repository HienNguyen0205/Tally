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

import { COLORS, FONT } from '../theme';

const PAGE = 60;
const COLUMNS = 3;
const GAP = 2;

/**
 * Android 13 tách quyền đọc ảnh ra khỏi quyền đọc bộ nhớ chung; máy cũ hơn vẫn
 * phải xin READ_EXTERNAL_STORAGE. iOS để Photos framework tự hỏi lúc truy cập.
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
 * Đường dẫn để QUÉT - phải là file thật vì Skia không hiểu 'ph://'. Trên iOS
 * nhờ Photos ghi ra file tạm, tiện thể chuyển HEIC (mặc định của iPhone, Skia
 * không giải mã được) sang JPEG.
 */
export async function toScanUri(uri: string): Promise<string> {
  if (!uri.startsWith('ph://')) return uri;

  const asset = await CameraRoll.iosGetImageDataById(uri, {
    convertHeicImages: true,
  });
  const path = asset.node.image.filepath;
  if (path == null || path === '') {
    throw new Error('không lấy được đường dẫn file của ảnh');
  }
  return asFileUri(path);
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
            <Text style={styles.message}>Thư viện chưa có ảnh nào.</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  message: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  gridRow: { gap: GAP, marginBottom: GAP },
});
