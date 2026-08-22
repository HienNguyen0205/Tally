import { useCallback, useRef, useState } from 'react';
import { useCameraDevice } from 'react-native-vision-camera';
import type { SkiaCameraRef } from 'react-native-vision-camera-skia';

/**
 * Camera hardware controls: lens, zoom, focus.
 *
 * No torch. It went with the shutter: a live counter has no moment of capture
 * to light, and a lamp left burning on a viewfinder is a flat battery.
 */
export function useCameraControls() {
  const camera = useRef<SkiaCameraRef>(null);

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const [zoom, setZoom] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  // CameraX throws "Camera is not active" if zoom is set before the session is
  // up, so the screen must withhold it until this flips.
  const [cameraReady, setCameraReady] = useState(false);

  const flip = useCallback(() => {
    setFacing(f => (f === 'back' ? 'front' : 'back'));
  }, []);

  /** Picks a lens outright, for a screen that knows which one it wants -
   *  face enrolment opens on the front one. */
  const selectLens = useCallback((next: 'back' | 'front') => {
    setFacing(next);
  }, []);

  const focusAt = useCallback((x: number, y: number) => {
    setFocusPoint({ x, y });
    camera.current?.focusTo({ x, y }).catch(() => {}); // unsupported: ignore
  }, []);

  return {
    camera,
    device,
    facing,
    flip,
    selectLens,
    zoom,
    setZoom,
    focusPoint,
    focusAt,
    cameraReady,
    setCameraReady,
  };
}
