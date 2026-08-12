import { useCallback, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
// Chú ý: Skia và nitro-image cùng có kiểu tên `ImageFormat` nhưng khác hẳn nhau
// (Skia là enum số, nitro-image là chuỗi 'jpg'), nên đổi tên khi import.
import { ImageFormat as SkImageFormat } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { Images } from 'react-native-nitro-image';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Lưu ảnh đã gắn box vào thư viện ảnh của máy.
 *
 * Skia chỉ cho ra mảng byte, còn CameraRoll lại cần đường dẫn file - nên phải
 * đi qua nitro-image (đã có sẵn trong dự án) để ghi ra file tạm trước.
 */
export function useSavePhoto() {
  const [state, setState] = useState<SaveState>('idle');

  const save = useCallback(async (snapshot: SkImage | undefined) => {
    if (snapshot == null) {
      setState('error');
      return;
    }

    try {
      setState('saving');

      // Từ API 29 trở lên MediaStore tự lo, chỉ máy cũ mới phải xin quyền.
      if (Platform.OS === 'android' && Number(Platform.Version) <= 28) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setState('error');
          return;
        }
      }

      const bytes = snapshot.encodeToBytes(SkImageFormat.JPEG, 92);
      const image = await Images.loadFromEncodedImageDataAsync({
        buffer: bytes.buffer as ArrayBuffer,
        width: snapshot.width(),
        height: snapshot.height(),
        imageFormat: 'jpg',
      });
      const path = await image.saveToTemporaryFileAsync('jpg', 92);

      await CameraRoll.saveAsset(`file://${path}`, { type: 'photo' });
      setState('saved');
    } catch (e) {
      console.warn('[useSavePhoto] lưu ảnh thất bại', e);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => setState('idle'), []);

  return { state, save, reset };
}
