import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  useCameraDevice,
  useCameraPermission,
  type TorchMode,
} from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef } from 'react-native-vision-camera-skia';
import {
  Canvas,
  Image as SkiaImage,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import {
  PERSON_CLASS_ID,
  MODEL_SIZE,
  SCORE_THRESHOLD,
  NMS_IOU,
} from '../constants';
import { useAlert } from '../hooks/useAlert';
import { useSavePhoto } from '../hooks/useSavePhoto';
import { ResultIsland } from '../components/ResultIsland';
import { ScanOverlay } from '../components/ScanOverlay';
import { GlassSurface } from '../components/GlassSurface';
import { FocusRing } from '../components/FocusRing';
import { IconButton } from '../components/IconButton';
import { ThresholdSlider } from '../components/ThresholdSlider';
import { ZoomSelector } from '../components/ZoomSelector';
import { ReviewBar } from '../components/ReviewBar';
import { LaunchScreen } from '../components/LaunchScreen';
import { DetailSheet, type DetailInfo } from '../components/DetailSheet';
import { DetectionBox } from '../components/DetectionBox';
import { ClassFilter } from '../components/ClassFilter';
import { PhotoPicker, toScanUri } from '../components/PhotoPicker';
import { boxToScreen, toFrameBox } from '../boxLayout';
import {
  mergeDetections,
  passesThreshold,
  type Detection,
} from '../detections';
import { readFrameDetections } from '../runModel';
import { scanImage } from '../scanImage';
import { annotate } from '../annotate';
import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../theme';

// 'idle': xem trước, chờ bấm chụp | 'capturing': quét đúng 1 frame kế tiếp
// 'frozen': tắt camera, giữ nguyên ảnh đã quét
type Mode = 'idle' | 'capturing' | 'frozen';

// Animation quét hiển thị thêm sau khi ảnh đã đóng băng, để thấy được là đang quét.
const SCAN_ANIM_MS = 900;

const pressEase = Easing.bezier(...EASE_OUT_EXPO);

// Các mức zoom quen thuộc; mức nào vượt quá khả năng máy sẽ tự bị loại bỏ.
const ZOOM_STEPS = [1, 2, 3, 5];

const RESIZER_FORMAT = {
  width: MODEL_SIZE,
  height: MODEL_SIZE,
  channelOrder: 'rgb',
  dataType: 'uint8',
  pixelLayout: 'interleaved',
} as const;

/** Màn hình trạng thái (xin quyền, đang nạp, lỗi) - thẻ nổi 2 lớp. */
function StateScreen({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { width, height } = useWindowDimensions();
  // Nằm ngang thì chiều cao ngắn hẳn - giữ nguyên padding dọc sẽ bị tràn.
  const landscape = width > height;

  return (
    <View style={[styles.center, landscape && styles.centerLandscape]}>
      <GlassSurface style={styles.stateShell} contentStyle={styles.stateCore}>
        <Text style={styles.stateEyebrow}>{eyebrow}</Text>
        <Text style={styles.stateTitle}>{title}</Text>
        {body != null && <Text style={styles.stateBody}>{body}</Text>}

        {action != null && (
          <Pressable
            style={styles.cta}
            accessibilityRole="button"
            onPress={action.onPress}
          >
            <Text style={styles.ctaText}>{action.label}</Text>
            <View style={styles.ctaIcon}>
              <Text style={styles.ctaArrow}>↗</Text>
            </View>
          </Pressable>
        )}
      </GlassSurface>
    </View>
  );
}

export function DetectorScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();

  const { width: winW, height: winH } = useWindowDimensions();
  const landscape = winW > winH;

  const [mode, setMode] = useState<Mode>('idle');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Detection[] | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [picked, setPicked] = useState<Detection | null>(null);
  // Class bị tắt trên hàng chip lọc. Rỗng = hiện tất cả.
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  // Khác null = đang xem ảnh thư viện chứ không phải ảnh vừa chụp.
  const [photo, setPhoto] = useState<SkImage | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // --- Điều khiển camera ---
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const [torch, setTorch] = useState<TorchMode>('off');
  const [zoom, setZoom] = useState(1);
  // Box vẽ đè lên ảnh nên đổi ngưỡng là lọc lại được ngay, không phải chụp lại.
  const [threshold, setThreshold] = useState(SCORE_THRESHOLD);

  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Camera chưa chạy mà đã set zoom/đèn thì CameraX ném "Camera is not active".
  // Chỉ truyền các điều khiển này sau khi phiên camera khởi động xong.
  const [cameraReady, setCameraReady] = useState(false);

  const camera = useRef<SkiaCameraRef>(null);
  const { state: saveState, save, reset: resetSave } = useSavePhoto();

  const press = useSharedValue(0);
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.05 * press.value }],
  }));

  const onAlert = useAlert();

  // Ô nhớ đọc/ghi được từ cả JS thread lẫn worklet thread: nút bấm (JS) ghi vào
  // đây, worklet đọc mỗi frame để biết có phải quét frame này không.
  const scanCmd = useMemo(() => createSynchronizable<Mode>('idle'), []);
  useEffect(() => {
    scanCmd.setBlocking(mode);
  }, [mode, scanCmd]);

  // --- Nạp model ---
  // ponytail: GPU delegate ('android-gpu') đã thử nhưng làm FPS tệ hơn trên
  // Tecno POVA 6 Neo - GPU delegate của TFLite hỗ trợ kém với model
  // quantized uint8 trên nhiều chip tầm trung. Dùng CPU mặc định.
  const objectDetection = useTensorflowModel(
    require('../../assets/models/efficientdet_lite2.tflite'),
    [],
  );
  const model =
    objectDetection.state === 'loaded' ? objectDetection.model : undefined;

  // --- Hai lượt quét, hai cách ép frame vào ô vuông của model ---
  // Khung dọc 16:9 nhét vào ô vuông thì 44% bề ngang input là viền đen, vật thể
  // nhỏ teo còn vài chục pixel và trượt. Nên chạy thêm lượt 'cover' dùng trọn
  // 448px cho phần giữa khung, rồi gộp: không mất rìa mà vẫn thấy vật thể nhỏ.
  // Cũng là cách nâng trần 25 detection/lượt lên 50.
  const { resizer: wideResizer, error: wideError } = useResizer({
    ...RESIZER_FORMAT,
    scaleMode: 'contain',
  });
  const { resizer: tightResizer, error: tightError } = useResizer({
    ...RESIZER_FORMAT,
    scaleMode: 'cover',
  });
  const resizerError = wideError ?? tightError;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // --- Worklet báo kết quả về JS thread ---
  const onScanned = useCallback(
    (wide: Detection[], tight: Detection[], frameW: number, frameH: number) => {
      // Quy về hệ frame TRƯỚC khi gộp - so trực tiếp toạ độ thô của hai ô
      // vuông khác nhau sẽ ra kết quả vô nghĩa.
      const merged = mergeDetections(
        [
          wide.map(d => ({ ...d, ...toFrameBox(d, 'contain', frameW, frameH) })),
          tight.map(d => ({ ...d, ...toFrameBox(d, 'cover', frameW, frameH) })),
        ],
        NMS_IOU,
      );

      setResult(merged);
      setFrameSize({ w: frameW, h: frameH });
      setMode('frozen'); // tắt camera ngay, giữ đúng ảnh vừa quét

      const people = merged.filter(
        d => d.classId === PERSON_CLASS_ID && passesThreshold(d, threshold),
      ).length;
      if (people > 0) onAlert(people);
    },
    [onAlert, threshold],
  );

  // Quét ảnh thư viện: cùng model, cùng hai lượt, cùng phép gộp như ảnh chụp.
  const onPickPhoto = useCallback(
    async (uri: string) => {
      setPickerOpen(false);
      if (model == null) return;

      setScanning(true);
      try {
        // iOS phải đổi 'ph://' thành file tạm trước; Android đã là file sẵn.
        const data = await Skia.Data.fromURI(await toScanUri(uri));
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (image == null) throw new Error('không giải mã được ảnh');

        const found = scanImage(model, image);
        if (found == null) throw new Error('không dựng được surface xử lý ảnh');

        setPhoto(image);
        setFrameSize({ w: image.width(), h: image.height() });
        setResult(found);
        setHidden(new Set());
        setPicked(null);
        resetSave();
        setMode('frozen');

        const people = found.filter(
          d => d.classId === PERSON_CLASS_ID && passesThreshold(d, threshold),
        ).length;
        if (people > 0) onAlert(people);
      } catch (e) {
        console.warn('[DetectorScreen] quét ảnh từ thư viện thất bại', e);
        setScanning(false);
        // Báo hẳn ra: bấm vào ảnh mà không có gì xảy ra thì chỉ như app hỏng.
        Alert.alert('Không quét được ảnh', String(e));
      }
    },
    [model, threshold, onAlert, resetSave],
  );

  // Animation quét chạy thêm một lúc để người dùng kịp thấy phản hồi.
  useEffect(() => {
    if (!scanning) return;
    const t = setTimeout(() => setScanning(false), SCAN_ANIM_MS);
    return () => clearTimeout(t);
  }, [scanning]);

  // Box đang mở chi tiết mà bị ẩn đi thì bảng phải đóng theo, không thì nó trỏ
  // vào thứ không còn trên màn.
  useEffect(() => {
    if (picked == null) return;
    if (!passesThreshold(picked, threshold) || hidden.has(picked.classId)) {
      setPicked(null);
    }
  }, [picked, threshold, hidden]);

  // Tập mà hàng chip đếm: tắt một class không làm chip của nó biến mất.
  const scored = useMemo(
    () => result?.filter(d => passesThreshold(d, threshold)) ?? [],
    [result, threshold],
  );

  const visible = useMemo(
    () => scored.filter(d => !hidden.has(d.classId)),
    [scored, hidden],
  );

  const classCounts = useMemo(() => {
    const byClass = new Map<number, number>();
    for (const d of scored) {
      byClass.set(d.classId, (byClass.get(d.classId) ?? 0) + 1);
    }
    return [...byClass]
      .map(([classId, count]) => ({ classId, count }))
      .sort((a, b) => b.count - a.count);
  }, [scored]);

  const toggleClass = useCallback((classId: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }, []);

  if (device == null) {
    return <StateScreen eyebrow="THIẾT BỊ" title="Không tìm thấy camera" />;
  }

  if (!hasPermission) {
    return (
      <StateScreen
        eyebrow="QUYỀN TRUY CẬP"
        title="Cần quyền dùng camera"
        body="Ảnh được xử lý hoàn toàn trên máy, không có hình nào rời khỏi thiết bị."
        action={{ label: 'Cấp quyền', onPress: requestPermission }}
      />
    );
  }

  if (objectDetection.state === 'loading') {
    return <LaunchScreen status="Đang nạp mô hình" />;
  }

  if (objectDetection.state === 'error') {
    return (
      <StateScreen
        eyebrow="LỖI"
        title="Không nạp được model"
        body={String(objectDetection.error)}
      />
    );
  }

  if (resizerError != null) {
    return (
      <StateScreen
        eyebrow="LỖI"
        title="Không khởi tạo được resizer"
        body={String(resizerError)}
      />
    );
  }

  const peopleCount = visible.filter(
    d => d.classId === PERSON_CLASS_ID,
  ).length;

  const zoomSteps = ZOOM_STEPS.filter(z => z <= device.maxZoom);

  const pickedInfo: DetailInfo | null =
    picked != null
      ? {
          classId: picked.classId,
          score: picked.score,
          areaRatio: (picked.xmax - picked.xmin) * (picked.ymax - picked.ymin),
        }
      : null;

  const reviewing = mode === 'frozen' && !scanning;
  // Lúc xem ảnh chỉ còn thanh ngưỡng là có tác dụng, và bảng chi tiết mở thì
  // nhường hẳn chỗ cho nó.
  const showTools = (mode === 'idle' || reviewing) && picked == null;

  return (
    <View style={styles.container}>
      <SkiaCamera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={mode !== 'frozen'}
        pixelFormat="yuv"
        constraints={[{ fps: 15 }]}
        zoom={cameraReady ? zoom : undefined}
        torchMode={cameraReady ? torch : undefined}
        onStarted={() => setCameraReady(true)}
        onStopped={() => setCameraReady(false)}
        onError={e => {
          // CameraX huỷ lệnh zoom/đèn nếu phiên camera đang khởi động lại
          // (đổi camera trước/sau, Fast Refresh). Vô hại: lần set sau sẽ ăn.
          // Chỉ nuốt đúng lỗi này, còn lại vẫn phải thấy được.
          const msg = String(e);
          if (
            msg.includes('OperationCanceledException') ||
            msg.includes('Camera is not active')
          ) {
            return;
          }
          console.warn('[Camera]', e);
        }}
        // Xoay buffer về đúng chiều đứng TRƯỚC khi tới tay ta. Không bật thì
        // frame giữ nguyên chiều cảm biến (nằm ngang khi cầm máy dọc) → model
        // nhận ảnh người nằm nghiêng 90°, detect kém và box lệch hẳn.
        enablePhysicalBufferRotation={true}
        // Cố ý bỏ render sau khi chụp để đóng băng ảnh → tắt cảnh báo.
        warnIfRenderSkipped={false}
        onFrame={(frame, render) => {
          'worklet';

          const cmd = scanCmd.getDirty();

          // Đã chụp xong: bỏ qua mọi frame sau đó (camera đang tắt dần). Không
          // render nữa để canvas giữ nguyên đúng frame đã quét - nếu vẫn render,
          // ảnh hiển thị sẽ là frame mới hơn nhưng box lại của frame cũ.
          if (cmd === 'frozen') {
            frame.dispose();
            return;
          }

          if (
            cmd === 'capturing' &&
            model != null &&
            wideResizer != null &&
            tightResizer != null
          ) {
            const wide = readFrameDetections(model, wideResizer, frame);
            const tight = readFrameDetections(model, tightResizer, frame);

            // Khoá ngay tại đây (không đợi state React vòng sau) để các frame
            // kế tiếp không quét đè lên ảnh vừa chụp.
            scanCmd.setBlocking('frozen');
            // Gửi kèm kích thước frame: JS cần nó để quy box về hệ khung hình.
            scheduleOnRN(onScanned, wide, tight, frame.width, frame.height);
          }

          render(({ frameTexture, canvas }) => {
            canvas.drawImage(frameTexture, 0, 0);
          });

          frame.dispose();
        }}
      />

      {/* Ảnh thư viện, đè lên canvas camera đã đóng băng. Vẽ bằng chính SkImage
          đã đưa cho model để khỏi lệch EXIF; fit="cover" khớp boxToScreen. */}
      {photo != null && (
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaImage
            image={photo}
            x={0}
            y={0}
            width={winW}
            height={winH}
            fit="cover"
          />
        </Canvas>
      )}

      {/* Lấy nét. Nằm dưới mọi nút nên không cướp chạm của chúng. */}
      {mode === 'idle' && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Chạm vào khung hình để lấy nét"
          onPress={e => {
            const { locationX, locationY } = e.nativeEvent;
            setFocusPoint({ x: locationX, y: locationY });
            camera.current
              ?.focusTo({ x: locationX, y: locationY })
              .catch(() => {}); // máy không hỗ trợ lấy nét thì bỏ qua
          }}
        />
      )}

      {focusPoint != null && (
        <FocusRing
          key={`${focusPoint.x},${focusPoint.y}`}
          x={focusPoint.x}
          y={focusPoint.y}
        />
      )}

      {/* Chạm ra ngoài box để đóng bảng chi tiết. Nằm dưới các box nên chạm
          sang box khác vẫn đổi được, không bị nền nuốt mất. */}
      {picked != null && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Đóng bảng chi tiết"
          onPress={() => setPicked(null)}
        />
      )}

      {reviewing &&
        frameSize != null &&
        visible.map((d, i) => (
          <DetectionBox
            key={i}
            detection={d}
            rect={boxToScreen(d, frameSize.w, frameSize.h, winW, winH)}
            selected={picked === d}
            onPress={() => setPicked(d)}
          />
        ))}

      {picked != null && (
        <View
          style={[
            styles.detailAnchor,
            landscape
              ? styles.detailAnchorLandscape
              : styles.detailAnchorPortrait,
          ]}
        >
          <DetailSheet info={pickedInfo!} onClose={() => setPicked(null)} />
        </View>
      )}

      {scanning && <ScanOverlay />}

      <ResultIsland
        peopleCount={peopleCount}
        objectCount={visible.length}
        hasResult={result != null}
      />

      {showTools && (
        <View
          style={[
            styles.tools,
            landscape ? styles.toolsLandscape : styles.toolsPortrait,
            reviewing && !landscape && styles.toolsReviewPortrait,
          ]}
        >
          {reviewing && (
            <ClassFilter
              counts={classCounts}
              hidden={hidden}
              onToggle={toggleClass}
            />
          )}

          <GlassSurface pill contentStyle={styles.toolRow}>
            {mode === 'idle' && (
              <IconButton
                name="bolt"
                label={torch === 'on' ? 'Tắt đèn flash' : 'Bật đèn flash'}
                active={torch === 'on'}
                // Camera trước không có đèn nên khoá hẳn, tránh bấm vô ích.
                disabled={facing === 'front'}
                onPress={() => setTorch(t => (t === 'on' ? 'off' : 'on'))}
              />
            )}

            {mode === 'idle' && (
              <IconButton
                name="image"
                label="Quét ảnh có sẵn trong thư viện"
                onPress={() => setPickerOpen(true)}
              />
            )}

            <ThresholdSlider value={threshold} onChange={setThreshold} />

            {mode === 'idle' && (
              <IconButton
                name="flip"
                label="Đổi camera trước sau"
                onPress={() => {
                  setFacing(f => (f === 'back' ? 'front' : 'back'));
                  setTorch('off'); // camera trước không có đèn
                }}
              />
            )}
          </GlassSurface>

          {mode === 'idle' && (
            <GlassSurface pill contentStyle={styles.zoomRow}>
              <ZoomSelector steps={zoomSteps} value={zoom} onChange={setZoom} />
            </GlassSurface>
          )}
        </View>
      )}

      <View
        style={[
          styles.controls,
          landscape ? styles.controlsLandscape : styles.controlsPortrait,
        ]}
      >
        {reviewing ? (
          <ReviewBar
            saveState={saveState}
            onRetake={() => {
              setResult(null);
              setPicked(null);
              setPhoto(null);
              setHidden(new Set());
              resetSave();
              setMode('idle');
            }}
            onSave={() => {
              // Ảnh thư viện thì lưu chính nó, ảnh chụp thì lấy từ canvas.
              const source = photo ?? camera.current?.takeSnapshot();
              // Chỉ nung vào pixel đúng những box đang hiện.
              save(
                source != null && frameSize != null
                  ? annotate(source, visible, frameSize.w, frameSize.h)
                  : undefined,
              );
            }}
          />
        ) : (
          <>
            <Text style={styles.controlHint}>Chạm để quét</Text>

            <Animated.View style={shutterStyle}>
              <Pressable
                style={styles.shutterShell}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityLabel="Chụp và quét"
                onPressIn={() => {
                  press.value = withTiming(1, {
                    duration: 180,
                    easing: pressEase,
                  });
                }}
                onPressOut={() => {
                  press.value = withTiming(0, {
                    duration: 420,
                    easing: pressEase,
                  });
                }}
                onPress={() => {
                  setScanning(true);
                  setMode('capturing');
                }}
              >
                <View style={styles.shutterRing}>
                  <View
                    style={[
                      styles.shutterCore,
                      scanning && styles.shutterCoreBusy,
                    ]}
                  />
                </View>
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>

      {pickerOpen && (
        <PhotoPicker
          onPick={onPickPhoto}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // --- Màn hình trạng thái ---
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
    paddingHorizontal: 28,
    paddingVertical: 96,
  },
  centerLandscape: { paddingVertical: 28 },
  stateShell: { width: '100%', maxWidth: 420 },
  stateCore: { paddingVertical: 32, paddingHorizontal: 26 },
  stateEyebrow: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 9,
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  stateTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 26,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  stateBody: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },

  // --- CTA ---
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 12,
    marginTop: 26,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pillShell,
    paddingLeft: 22,
    paddingRight: 6,
    paddingVertical: 6,
  },
  ctaText: { color: '#04120A', fontFamily: FONT.semibold, fontSize: 14 },
  ctaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: { color: '#04120A', fontFamily: FONT.semibold, fontSize: 14 },

  // --- Thanh công cụ camera ---
  tools: { position: 'absolute', alignItems: 'center', gap: 10 },
  // 54 (đáy) + 86 (nút chụp) + 16 + chữ gợi ý ≈ 170 là đỉnh cụm nút chụp,
  // nên phải đẩy lên hẳn để hai cụm không dính vào nhau.
  toolsPortrait: { bottom: 208, left: 0, right: 0 },
  // Lúc xem ảnh nút chụp nhường chỗ cho ReviewBar thấp hơn hẳn, hạ theo.
  toolsReviewPortrait: { bottom: 150 },
  // Nằm ngang: dồn về giữa-trái, chừa cạnh phải cho nút chụp.
  toolsLandscape: { bottom: 24, left: 0, right: 160 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
  },
  zoomRow: { paddingHorizontal: 4, paddingVertical: 3 },

  // --- Bảng chi tiết ---
  detailAnchor: { position: 'absolute', alignItems: 'center' },
  detailAnchorPortrait: { bottom: 190, left: 0, right: 0 },
  // Nằm ngang: nép sang trái, chừa cạnh phải cho nút chụp.
  detailAnchorLandscape: { bottom: 20, left: 24 },

  // --- Nút chụp ---
  controls: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  controlsPortrait: { bottom: 54, left: 0, right: 0 },
  // Nằm ngang: nút chụp về cạnh phải, ngang tầm ngón cái khi cầm hai tay.
  controlsLandscape: { right: 40, top: 0, bottom: 0 },
  controlHint: {
    // Chữ nổi trực tiếp trên khung hình nên phải tự lo tương phản: nền camera
    // có thể sáng trắng, để màu mờ như các nhãn nằm trong thẻ kính là mất chữ.
    color: 'rgba(255,255,255,0.88)',
    fontFamily: FONT.medium,
    fontSize: 10,
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  shutterShell: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: COLORS.shell,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.accent,
  },
  shutterCoreBusy: { backgroundColor: 'rgba(0,230,118,0.35)' },
});
