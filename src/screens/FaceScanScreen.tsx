import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  Points,
  rect,
  rrect,
  type SkImage,
} from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT, RADIUS } from '../shared/theme';
import { t } from '../i18n';
import type { Detection } from '../shared/detections';
import type { ScreenRect } from '../shared/boxLayout';
import type { Identity } from '../hooks/useFaceIdentity';
import { faceCropRect } from '../detection/faceEmbed';
import { readMesh } from '../detection/faceMesh';
import { meshSegments, type MeshPoint } from '../detection/meshTopology';
import { useEnter } from '../hooks/useEnter';
import { GlassSurface } from '../components/GlassSurface';
import { IconButton } from '../components/IconButton';

type Step = 'working' | 'done' | 'failed';

/** Corner radius of the scan panel. */
const PANEL_RADIUS = 26;

interface Props {
  /** FaceMesh, borrowed from DetectorScreen - undefined if it failed to load,
   *  in which case the face still gets a picture and a name, just no lattice. */
  mesh: TensorflowModel | undefined;
  /** The box that was tapped, frozen at that moment. The face underneath has
   *  moved on since; this screen is about the face as it was when picked. */
  box: Detection;
  /** Who this face belongs to. Arrives live and may still be 'reading' when
   *  this opens, so it is watched rather than copied - see `held` below. */
  identity?: Identity;
  takeSnapshot: () => SkImage | null;
  onClose: () => void;
}

/**
 * The scan preview: one tapped face, blown up, with its mesh drawn over it and
 * whatever the app knows about the person underneath.
 *
 * This replaced a detail sheet parked at the bottom of the camera screen. The
 * sheet could only ever repeat what the box already said - a name and a
 * percentage - while the thing that makes this app worth opening, the 468
 * landmarks it puts on a face, was a half-transparent lattice on a moving
 * viewfinder that nobody could actually look at. Tapping a box now stops the
 * world and shows you the scan.
 *
 * Frozen, deliberately. The mesh model runs once per tap, on one snapshot, and
 * the picture shown is that same snapshot: image and lattice come from a single
 * frame, so they line up exactly. Running it live would mean an inference per
 * frame per face, and a lattice that lags the face by one inference is worse
 * than a still that lags it by however long you look at it.
 */
export function FaceScanScreen({
  mesh,
  box,
  identity,
  takeSnapshot,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  // Square, and never taller than the room left between the header and the
  // text below it - a panel that overflows in landscape would push the name
  // off the bottom of the screen.
  const panel = Math.min(winW - 56, winH * 0.42, 340);

  const [step, setStep] = useState<Step>('working');
  const [shot, setShot] = useState<SkImage | null>(null);
  const [crop, setCrop] = useState<ScreenRect | null>(null);
  const [lines, setLines] = useState<MeshPoint[] | null>(null);

  const panelIn = useEnter(60);
  const nameIn = useEnter(220);
  const statsIn = useEnter(320);

  /**
   * The last identity that actually said something.
   *
   * The track dies as soon as its face leaves the frame, and useFaceIdentity
   * prunes the answer with it - so a screen reading the live value would blank
   * the name the moment the person walked off, while their scan is still on
   * screen being looked at. What was true when this opened stays on screen.
   */
  const held = useRef(identity);
  if (identity != null) held.current = identity;
  const shown = held.current;

  const scan = useCallback(async () => {
    setStep('working');
    setLines(null);

    const image = takeSnapshot();
    if (image == null) {
      setStep('failed');
      return;
    }

    const src = faceCropRect(box, image.width(), image.height());
    setShot(image);
    setCrop(src);

    if (mesh == null) {
      setStep('done');
      return;
    }

    try {
      const read = await readMesh(mesh, image, src);
      if (read == null || read.points.length === 0) {
        // A picture with no lattice, not an error screen: the crop is still
        // the face that was tapped, and the name under it is still right.
        setStep('done');
        return;
      }

      // Landmarks come back normalised to the whole snapshot, while the panel
      // shows only `src` blown up to fill it - so the map is the same one the
      // image transform below uses, and the two stay welded together.
      const sx = image.width() * (panel / src.width);
      const sy = image.height() * (panel / src.height);
      setLines(
        meshSegments(
          read.points,
          sx,
          sy,
          (-src.left * panel) / src.width,
          (-src.top * panel) / src.height,
        ),
      );
      setStep('done');
    } catch (e) {
      console.warn('[FaceScanScreen] mesh run failed', e);
      setStep('done');
    }
  }, [box, mesh, panel, takeSnapshot]);

  // Once, on open. `scan` is stable for as long as the tapped box is.
  useEffect(() => {
    scan();
  }, [scan]);

  const known = shown?.state === 'known';
  const accent = known ? COLORS.accent : COLORS.warn;

  const title =
    step === 'failed'
      ? t('scanFailed')
      : known
      ? shown.displayName
      : t('faceUnknownShort');

  const subtitle =
    step === 'working'
      ? t('scanMeshing')
      : step === 'failed'
      ? t('scanFailedBody')
      : shown == null
      ? null
      : shown.state === 'reading'
      ? t('faceReading')
      : shown.state === 'known'
      ? t('faceMatchScore', {
          percent: Math.round(shown.similarity * 100),
        })
      : shown.state === 'unknown'
      ? t('faceNotEnrolled')
      : shown.reason === 'pose'
      ? t('faceTurnedAway')
      : shown.reason === 'offline'
      ? t('faceOffline')
      : shown.reason === 'blurry'
      ? t('faceBlurry')
      : shown.reason === 'config'
      ? t('faceMisconfigured')
      : t('faceUnreadable');

  const clip = rrect(rect(0, 0, panel, panel), PANEL_RADIUS, PANEL_RADIUS);

  return (
    <View style={styles.root}>
      {/* The scrim doubles as the dismiss target: tapping the camera you can
          half-see behind this is the same gesture as tapping away a sheet. */}
      <Pressable
        style={styles.scrim}
        accessibilityLabel={t('closeScan')}
        onPress={onClose}
      />

      <View style={[styles.header, { top: insets.top + 12 }]}>
        <GlassSurface pill contentStyle={styles.headerCore}>
          {step !== 'working' && (
            <IconButton name="refresh" label={t('scanAgain')} onPress={scan} />
          )}
          <IconButton name="close" label={t('closeScan')} onPress={onClose} />
        </GlassSurface>
      </View>

      <View style={styles.stack} pointerEvents="box-none">
        <Animated.View style={panelIn}>
          <GlassSurface
            style={styles.panelShell}
            contentStyle={styles.panelCore}
          >
            <Canvas style={{ width: panel, height: panel }}>
              <Group clip={clip}>
                {shot != null && crop != null && (
                  <Group
                    transform={[
                      { translateX: (-crop.left * panel) / crop.width },
                      { translateY: (-crop.top * panel) / crop.height },
                      { scaleX: panel / crop.width },
                      { scaleY: panel / crop.height },
                    ]}
                  >
                    <SkiaImage
                      image={shot}
                      x={0}
                      y={0}
                      width={shot.width()}
                      height={shot.height()}
                      fit="none"
                    />
                  </Group>
                )}

                {/* Already in panel pixels, so it sits outside the transform
                    above - one less place for the two to drift apart. */}
                {lines != null && (
                  <Points
                    points={lines}
                    mode="lines"
                    color={COLORS.accent}
                    style="stroke"
                    strokeWidth={1}
                    opacity={0.65}
                  />
                )}
              </Group>
            </Canvas>
          </GlassSurface>
        </Animated.View>

        <Animated.View style={[styles.copy, nameIn]}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.dot, { backgroundColor: accent }]} />
            <Text style={styles.eyebrow}>{t('scanEyebrow')}</Text>
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle != null && (
            <Text
              style={[styles.subtitle, { color: accent }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          )}
        </Animated.View>

        <Animated.View style={statsIn}>
          <GlassSurface pill contentStyle={styles.statsCore}>
            <Stat
              label={t('scanConfidence')}
              value={`${Math.round(box.score * 100)}%`}
            />
            <View style={styles.divider} />
            <Stat
              label={t('scanLandmarks')}
              value={lines == null ? '—' : String(lines.length / 2)}
            />
          </GlassSurface>
        </Animated.View>
      </View>
    </View>
  );
}

/** One figure with its caption, for the stats pill under the name. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  // Heavier than a sheet's backdrop on purpose: this is a screen, and the
  // viewfinder behind it is context, not content.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,5,6,0.86)' },

  header: { position: 'absolute', right: 16 },
  headerCore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 1,
  },

  stack: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: 28,
  },

  // The canvas is exactly the core's content, so the bezel wraps the picture
  // with no padding of its own.
  panelShell: { borderRadius: RADIUS.shell },
  panelCore: { padding: 0, overflow: 'hidden' },

  copy: { alignItems: 'center', gap: 6 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  eyebrow: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 9.5,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.bold,
    fontSize: 27,
    letterSpacing: -0.9,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  subtitle: {
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  statsCore: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stat: { alignItems: 'center', paddingHorizontal: 18, gap: 2 },
  statValue: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 15,
    letterSpacing: -0.3,
  },
  statLabel: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: COLORS.hairline,
  },
});
