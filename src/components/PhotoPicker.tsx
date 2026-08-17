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

import { COLORS, FONT } from '../shared/theme';
import { t } from '../shared/strings';

const PAGE = 60;
const COLUMNS = 3;
const GAP = 2;

/**
 * Android 13 split photo access out of general storage access; older devices
 * still need READ_EXTERNAL_STORAGE. On iOS the Photos framework asks by itself
 * on first access.
 *
 * From Android 14 the user can grant access to SOME photos only. The system
 * still reports READ_MEDIA_IMAGES as "granted" (the REVOKED_COMPAT flag, so old
 * code keeps working) but `getPhotos` returns exactly the chosen photos - which
 * may be none at all. Calling this again reopens the picker to add more.
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
 * The URI for DISPLAY in the grid. iOS returns 'ph://<id>' - a Photos
 * identifier, not a file - but <Image> understands it via the handler
 * camera-roll installs.
 */
function displayUri(image: { uri: string; filepath: string | null }): string {
  const path = image.filepath;
  if (path == null || path === '') return image.uri;
  return asFileUri(path);
}

/**
 * Reads the chosen photo's bytes into `SkData` for Skia.
 *
 * `Skia.Data.fromURI` only loads real files and URLs, while the picker hands
 * back system photo-store identifiers - and worse, it **hangs silently** on
 * those URIs rather than reporting an error. So resolve to bytes first:
 *
 * - Android: read `content://…` with `fetch` (RN's networking layer understands
 *   the scheme, the same mechanism that lets <Image> show the grid thumbnails).
 * - iOS: `ph://<id>` is a Photos identifier, so have camera-roll write a temp
 *   file, which also converts HEIC (the iPhone default) to JPEG.
 */
export async function loadImageData(uri: string): Promise<SkData> {
  if (uri.startsWith('ph://')) {
    const asset = await CameraRoll.iosGetImageDataById(uri, {
      convertHeicImages: true,
    });
    const path = asset.node.image.filepath;
    if (path == null || path === '') {
      throw new Error('could not resolve the photo file path');
    }
    return Skia.Data.fromURI(asFileUri(path));
  }

  if (!uri.startsWith('content://')) return Skia.Data.fromURI(uri);

  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('could not read the chosen photo'));
    reader.readAsDataURL(blob);
  });
  return Skia.Data.fromBase64(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/**
 * A grid of recent photos to pick from for scanning.
 *
 * Tapping selects rather than scanning straight away. That costs one extra tap
 * for a single photo, but counting across a batch is the point of the app, and a
 * hidden long-press mode nobody discovers would not be.
 */
export function PhotoPicker({
  onPick,
  onClose,
}: {
  onPick: (uris: string[]) => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [uris, setUris] = useState<string[] | null>(null);
  // Insertion-ordered, so the batch is scanned in the order they were tapped.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Android 14+: the user granted some photos, not the whole library.
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((uri: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const cell = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const load = useCallback(async () => {
    try {
      if (!(await ensurePhotoPermission())) {
        setError(t.needPhotoPermission);
        return;
      }
      const page = await CameraRoll.getPhotos({
        first: PAGE,
        assetType: 'Photos',
      });
      setUris(page.edges.map(e => displayUri(e.node.image)));
      setLimited(page.limited === true);
    } catch (e) {
      console.warn('[PhotoPicker] could not read the photo library', e);
      setError(t.cannotReadLibrary);
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
          <Text style={styles.title}>{t.pickTitle}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.close}
            hitSlop={16}
            onPress={onClose}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {/* Partial library access: there has to be a way back to the picker, or
            someone who granted nothing by accident is stuck for good. */}
        {limited && uris != null && uris.length > 0 && (
          <Pressable style={styles.notice} onPress={load}>
            <Text style={styles.noticeText}>
              {t.limitedNotice(uris.length)}
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
                ? t.noPhotosGranted
                : t.noPhotos}
            </Text>
            {limited && (
              <Pressable style={styles.cta} onPress={load}>
                <Text style={styles.ctaText}>{t.grantMorePhotos}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={uris}
            keyExtractor={uri => uri}
            numColumns={COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={{
              // Clear the floating action button, which covers the last row.
              paddingBottom: insets.bottom + (selected.size > 0 ? 96 : 0),
            }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item);
              return (
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={
                    isSelected ? t.deselectPhoto : t.selectPhoto
                  }
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => toggle(item)}
                >
                  <Image
                    source={{ uri: item }}
                    style={{ width: cell, height: cell }}
                  />
                  {isSelected && (
                    <View
                      style={[styles.picked, { width: cell, height: cell }]}
                    >
                      <View style={styles.tick}>
                        {/* A glyph, not the Skia <Icon>: a Canvas renders
                            nothing inside a Modal on Android. */}
                        <Text style={styles.tickMark}>✓</Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {selected.size > 0 && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={styles.cta}
              accessibilityRole="button"
              onPress={() => onPick([...selected])}
            >
              <Text style={styles.ctaText}>{t.scanSelected(selected.size)}</Text>
            </Pressable>
          </View>
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
  picked: {
    position: 'absolute',
    alignItems: 'flex-end',
    padding: 6,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,230,118,0.22)',
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  tickMark: { color: '#04120A', fontFamily: FONT.semibold, fontSize: 12 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 12,
    backgroundColor: 'rgba(5,5,5,0.92)',
  },
});
