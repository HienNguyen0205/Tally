import { useCallback, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
// Careful: Skia and nitro-image both export a type called `ImageFormat`, but
// they are nothing alike (Skia's is a numeric enum, nitro-image's is the string
// 'jpg'), so rename on import.
import { ImageFormat as SkImageFormat } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { Images } from 'react-native-nitro-image';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Saves the annotated image into the device's photo library.
 *
 * Skia only hands back a byte array while CameraRoll wants a file path - so it
 * routes through nitro-image (already a dependency) to write a temp file first.
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

      // From API 29 up MediaStore handles this; only older devices must ask.
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
      console.warn('[useSavePhoto] saving the photo failed', e);
      setState('error');
    }
  }, []);

  const reset = useCallback(() => setState('idle'), []);

  return { state, save, reset };
}
