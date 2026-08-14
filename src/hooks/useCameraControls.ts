import { useCallback, useRef, useState } from 'react';
import { useCameraDevice, type TorchMode } from 'react-native-vision-camera';
import type { SkiaCameraRef } from 'react-native-vision-camera-skia';

/** Camera hardware controls: lens, torch, zoom, focus. */
export function useCameraControls() {
  const camera = useRef<SkiaCameraRef>(null);

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const [torch, setTorch] = useState<TorchMode>('off');
  const [zoom, setZoom] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  // CameraX throws "Camera is not active" if zoom/torch are set before the
  // session is up, so the screen must withhold them until this flips.
  const [cameraReady, setCameraReady] = useState(false);

  const flip = useCallback(() => {
    setFacing(f => (f === 'back' ? 'front' : 'back'));
    setTorch('off'); // the front camera has no torch
  }, []);

  const toggleTorch = useCallback(
    () => setTorch(t => (t === 'on' ? 'off' : 'on')),
    [],
  );

  const focusAt = useCallback((x: number, y: number) => {
    setFocusPoint({ x, y });
    camera.current?.focusTo({ x, y }).catch(() => {}); // unsupported: ignore
  }, []);

  return {
    camera,
    device,
    facing,
    flip,
    torch,
    toggleTorch,
    torchDisabled: facing === 'front',
    zoom,
    setZoom,
    focusPoint,
    focusAt,
    cameraReady,
    setCameraReady,
  };
}
