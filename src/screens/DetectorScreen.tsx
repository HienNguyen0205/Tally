import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
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
import { Skia, PaintStyle, FontWeight } from '@shopify/react-native-skia';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import {
  PERSON_CLASS_ID,
  MODEL_SIZE,
  SCORE_THRESHOLD,
  MAX_DETECTIONS,
} from '../constants';
import { COCO_LABELS, labelVi } from '../labels';
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
import { boxToScreen } from '../boxLayout';
import { COLORS, EASE_OUT_EXPO, FONT, RADIUS } from '../theme';

export interface Detection {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  score: number;
  classId: number;
}

// 'idle': xem trước, chờ bấm chụp | 'capturing': quét đúng 1 frame kế tiếp
// 'frozen': tắt camera, giữ nguyên ảnh đã quét
type Mode = 'idle' | 'capturing' | 'frozen';

// Animation quét hiển thị thêm sau khi ảnh đã đóng băng, để thấy được là đang quét.
const SCAN_ANIM_MS = 900;

// Paint/Font tạo 1 lần ở module scope, tái sử dụng trong worklet.
const PERSON_COLOR = '#00E676'; // người - xanh
const OBJECT_COLOR = '#FFC400'; // vật thể khác - vàng

function makePaint(color: string, style: PaintStyle, strokeWidth = 0) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(style);
  if (strokeWidth > 0) paint.setStrokeWidth(strokeWidth);
  return paint;
}
const personPaint = makePaint(PERSON_COLOR, PaintStyle.Stroke, 4);
const objectPaint = makePaint(OBJECT_COLOR, PaintStyle.Stroke, 4);
// Nền nhãn tô đặc cùng màu box, chữ đen lên trên cho dễ đọc.
const personFill = makePaint(PERSON_COLOR, PaintStyle.Fill);
const objectFill = makePaint(OBJECT_COLOR, PaintStyle.Fill);
const textPaint = makePaint('#000000', PaintStyle.Fill);

// Phải đặt đúng tên family có thật trên máy. 'System'/'Roboto'/chuỗi rỗng đều
// trả về Typeface trông hợp lệ nhưng KHÔNG có glyph (đo chữ ra width = 0, vẽ ra
// vô hình). Chỉ 'sans-serif' hoạt động - đây là tên family Android thật sự có.
const LABEL_FONT_FAMILY = Platform.select({
  android: 'sans-serif',
  default: 'Helvetica',
});
const labelFont = Skia.Font(
  Skia.FontMgr.System().matchFamilyStyle(LABEL_FONT_FAMILY, {
    weight: FontWeight.Bold,
  }),
  24,
);


const pressEase = Easing.bezier(...EASE_OUT_EXPO);

// Các mức zoom quen thuộc; mức nào vượt quá khả năng máy sẽ tự bị loại bỏ.
const ZOOM_STEPS = [1, 2, 3, 5];

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
            {/* Mũi tên lồng trong vòng tròn riêng, không đứng trần cạnh chữ. */}
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

  // --- Điều khiển camera ---
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const [torch, setTorch] = useState<TorchMode>('off');
  const [zoom, setZoom] = useState(1);
  // Ngưỡng áp dụng cho LẦN CHỤP SAU: box đã được vẽ chết vào ảnh đóng băng nên
  // đổi ngưỡng không thể lọc lại kết quả cũ.
  const [threshold, setThreshold] = useState(SCORE_THRESHOLD);

  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Camera chưa chạy mà đã set zoom/đèn thì CameraX ném "Camera is not active".
  // Chỉ truyền các điều khiển này sau khi phiên camera khởi động xong.
  const [cameraReady, setCameraReady] = useState(false);

  const camera = useRef<SkiaCameraRef>(null);
  const { state: saveState, save, reset: resetSave } = useSavePhoto();

  // Nút lún xuống khi bấm - phản hồi vật lý thay vì đổi màu cứng.
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


  // --- Resize frame về đúng kích thước model yêu cầu (GPU-accelerated) ---
  const { resizer, error: resizerError } = useResizer({
    width: MODEL_SIZE,
    height: MODEL_SIZE,
    channelOrder: 'rgb',
    dataType: 'uint8',
    // 'contain' = letterbox: giữ trọn khung hình, thêm viền đen cho vừa ô vuông.
    // Đây cũng là cách tiền xử lý chuẩn của YOLO và phần lớn detector - detector
    // chịu được viền đen tốt hơn nhiều so với ảnh bị bóp méo tỉ lệ ('stretch').
    scaleMode: 'contain',
    pixelLayout: 'interleaved',
  });

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // --- Worklet báo kết quả về JS thread ---
  const onScanned = useCallback(
    (found: Detection[], frameW: number, frameH: number) => {
      setResult(found);
      setFrameSize({ w: frameW, h: frameH });
      setMode('frozen'); // tắt camera ngay, giữ đúng ảnh vừa quét
      const people = found.filter(d => d.classId === PERSON_CLASS_ID).length;
      if (people > 0) onAlert(people);
    },
    [onAlert],
  );

  // Animation quét chạy thêm một lúc để người dùng kịp thấy phản hồi.
  useEffect(() => {
    if (!scanning) return;
    const t = setTimeout(() => setScanning(false), SCAN_ANIM_MS);
    return () => clearTimeout(t);
  }, [scanning]);

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

  const peopleCount =
    result?.filter(d => d.classId === PERSON_CLASS_ID).length ?? 0;

  // Loại sẵn các mức vượt quá khả năng phóng của ống kính.
  const zoomSteps = ZOOM_STEPS.filter(z => z <= device.maxZoom);

  // Toạ độ model nằm trong ô vuông letterbox chứ không phải khung hình, nên
  // phải quy về hệ frame trước khi nói "chiếm bao nhiêu %" hay "nằm ở đâu" -
  // nếu lấy thẳng số chuẩn hoá sẽ báo tỉ lệ nhỏ hơn thực tế.
  const pickedInfo: DetailInfo | null =
    picked != null && frameSize != null
      ? (() => {
          const r = boxToScreen(
            picked,
            frameSize.w,
            frameSize.h,
            frameSize.w,
            frameSize.h,
          );
          return {
            classId: picked.classId,
            score: picked.score,
            areaRatio:
              (r.width * r.height) / (frameSize.w * frameSize.h),
            centerX: (r.left + r.width / 2) / frameSize.w,
            centerY: (r.top + r.height / 2) / frameSize.h,
          };
        })()
      : null;

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

          // Buffer đã xoay đứng nên frame.width/height chính là chiều thật.
          //
          // resizer dùng scaleMode 'contain' (letterbox): toàn bộ khung hình
          // được thu vừa vào ô vuông 320x320, phần thừa là viền đen. Ô vuông đó
          // tương ứng với hình vuông cạnh = CẠNH DÀI của frame, đặt giữa frame -
          // nên offset âm chính là phần viền đen cần trừ đi.
          //
          // Trước đây dùng 'cover' (cắt ô vuông giữa theo cạnh NGẮN) khiến 44%
          // chiều dọc không bao giờ được đưa vào model: người đứng ở mép trên
          // hoặc dưới ảnh không bao giờ bị phát hiện, dù preview vẫn hiện họ.
          const boxSize = Math.max(frame.width, frame.height);
          const offsetX = (frame.width - boxSize) / 2;
          const offsetY = (frame.height - boxSize) / 2;
          // Cỡ chữ nhãn bám cạnh ngắn để không đổi kích thước theo tỉ lệ khung.
          const shortSide = Math.min(frame.width, frame.height);

          // Box chỉ cần sống trong đúng frame tính ra nó: chụp xong là dừng
          // render, nên không phải giữ state qua các frame.
          let boxesToDraw: Detection[] = [];

          if (cmd === 'capturing' && model != null && resizer != null) {
            const resized = resizer.resize(frame);
            const inputBuffer = resized.getPixelBuffer();
            const outputs = model.runSync([inputBuffer]);
            resized.dispose();

            // Thứ tự output đã kiểm chứng bằng model.outputs của lite2:
            //   [0] [1,25,4] boxes | [1] [1,25] classes
            //   [2] [1,25] scores  | [3] [1] số lượng
            // Đổi model khác thì phải log lại model.outputs để xác nhận.
            const boxes = new Float32Array(outputs[0]!);
            const classes = new Float32Array(outputs[1]!);
            const scores = new Float32Array(outputs[2]!);
            const numDetections = new Float32Array(outputs[3]!);
            const detCount = Math.min(Number(numDetections[0]), MAX_DETECTIONS);

            const found: Detection[] = [];
            for (let i = 0; i < detCount; i++) {
              if (Number(scores[i]) < threshold) continue;
              found.push({
                ymin: boxes[i * 4]!,
                xmin: boxes[i * 4 + 1]!,
                ymax: boxes[i * 4 + 2]!,
                xmax: boxes[i * 4 + 3]!,
                score: scores[i]!,
                classId: Number(classes[i]),
              });
            }

            boxesToDraw = found;
            // Khoá ngay tại đây (không đợi state React vòng sau) để các frame
            // kế tiếp không quét đè lên ảnh vừa chụp.
            scanCmd.setBlocking('frozen');
            // Gửi kèm kích thước frame: JS cần nó để quy box về toạ độ màn hình
            // cho vùng chạm, vì box đang ở hệ toạ độ của ô vuông letterbox.
            scheduleOnRN(onScanned, found, frame.width, frame.height);
          }

          // Cỡ chữ theo độ phân giải frame (toạ độ vẽ là pixel của frame,
          // không phải pixel màn hình) để nhãn không bị bé tí trên frame lớn.
          const fontSize = Math.max(16, Math.round(shortSide * 0.045));
          labelFont.setSize(fontSize);
          const padX = fontSize * 0.35;
          const chipH = fontSize * 1.5;

          render(({ frameTexture, canvas }) => {
            canvas.drawImage(frameTexture, 0, 0);

            for (const box of boxesToDraw) {
              const isPerson = box.classId === PERSON_CLASS_ID;
              const x = offsetX + box.xmin * boxSize;
              const y = offsetY + box.ymin * boxSize;
              const w = (box.xmax - box.xmin) * boxSize;
              const h = (box.ymax - box.ymin) * boxSize;

              canvas.drawRect(
                Skia.XYWHRect(x, y, w, h),
                isPerson ? personPaint : objectPaint,
              );

              const name = COCO_LABELS[box.classId] ?? `#${box.classId}`;
              const text = `${name} ${Math.round(box.score * 100)}%`;
              const textW = labelFont.measureText(text).width;

              // Nhãn nằm trên box; nếu box sát mép trên thì lật xuống trong box.
              const chipY = y - chipH >= 0 ? y - chipH : y;
              canvas.drawRect(
                Skia.XYWHRect(x, chipY, textW + padX * 2, chipH),
                isPerson ? personFill : objectFill,
              );
              canvas.drawText(
                text,
                x + padX,
                chipY + chipH - fontSize * 0.4,
                textPaint,
                labelFont,
              );
            }
          });

          frame.dispose();
        }}
      />

      {/* Chạm vào khung hình để lấy nét. Nằm dưới mọi nút nên không cướp chạm. */}
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

      {/* Chạm ra ngoài box để đóng bảng chi tiết. Nằm dưới các vùng chạm box
          nên chạm sang box khác vẫn đổi được, không bị nền nuốt mất. */}
      {picked != null && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Đóng bảng chi tiết"
          onPress={() => setPicked(null)}
        />
      )}

      {/* Vùng chạm trong suốt đè lên từng box đã vẽ, để xem chi tiết. */}
      {mode === 'frozen' &&
        !scanning &&
        frameSize != null &&
        result?.map((d, i) => {
          const r = boxToScreen(d, frameSize.w, frameSize.h, winW, winH);
          return (
            <Pressable
              key={i}
              style={[
                styles.hitBox,
                {
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${labelVi(d.classId)}, độ tin cậy ${Math.round(
                d.score * 100,
              )} phần trăm. Chạm để xem chi tiết.`}
              onPress={() => setPicked(d)}
            />
          );
        })}

      {picked != null && (
        <View
          style={[
            styles.detailAnchor,
            landscape
              ? styles.detailAnchorLandscape
              : styles.detailAnchorPortrait,
          ]}
        >
          <DetailSheet
            info={pickedInfo!}
            onClose={() => setPicked(null)}
          />
        </View>
      )}

      {scanning && <ScanOverlay />}

      <ResultIsland
        peopleCount={peopleCount}
        objectCount={result?.length ?? 0}
        hasResult={result != null}
      />

      {/* Cụm chỉnh camera - ẩn khi đang xem ảnh đã đóng băng vì không còn tác dụng. */}
      {mode === 'idle' && (
        <View
          style={[
            styles.tools,
            landscape ? styles.toolsLandscape : styles.toolsPortrait,
          ]}
        >
          <GlassSurface pill contentStyle={styles.toolRow}>
            <IconButton
              name="bolt"
              label={torch === 'on' ? 'Tắt đèn flash' : 'Bật đèn flash'}
              active={torch === 'on'}
              // Camera trước không có đèn nên khoá hẳn, tránh bấm vô ích.
              disabled={facing === 'front'}
              onPress={() => setTorch(t => (t === 'on' ? 'off' : 'on'))}
            />

            <ThresholdSlider value={threshold} onChange={setThreshold} />

            <IconButton
              name="flip"
              label="Đổi camera trước sau"
              onPress={() => {
                setFacing(f => (f === 'back' ? 'front' : 'back'));
                setTorch('off'); // camera trước không có đèn
              }}
            />
          </GlassSurface>

          <GlassSurface pill contentStyle={styles.zoomRow}>
            <ZoomSelector steps={zoomSteps} value={zoom} onChange={setZoom} />
          </GlassSurface>
        </View>
      )}

      <View
        style={[
          styles.controls,
          landscape ? styles.controlsLandscape : styles.controlsPortrait,
        ]}
      >
        {mode === 'frozen' && !scanning ? (
          // Xem ảnh: hàng icon gọn, nhường tối đa diện tích cho khung hình.
          <ReviewBar
            saveState={saveState}
            onRetake={() => {
              setResult(null);
              setPicked(null);
              resetSave();
              setMode('idle');
            }}
            onSave={() => save(camera.current?.takeSnapshot())}
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
    // Macro-whitespace: để bố cục thở, không nhồi sát mép.
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

  // --- CTA với icon lồng trong vòng tròn riêng ---
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
  // Nằm ngang: dồn về giữa-trái, chừa cạnh phải cho nút chụp.
  toolsLandscape: { bottom: 24, left: 0, right: 160 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
  },
  zoomRow: { paddingHorizontal: 4, paddingVertical: 3 },

  // --- Chạm vào box xem chi tiết ---
  hitBox: { position: 'absolute' },
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
  shutterIcon: {
    fontSize: 26,
    color: COLORS.textPrimary,
    fontFamily: FONT.regular,
  },
  refreshCanvas: { width: 26, height: 26 },
});
