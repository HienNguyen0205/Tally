import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SkImage } from '@shopify/react-native-skia';
import type { TensorflowModel } from 'react-native-fast-tflite';
import type { SkiaCameraRef } from 'react-native-vision-camera-skia';

import { PERSON_CLASS_ID } from '../shared/constants';
import { boxToScreen } from '../shared/boxLayout';
import type { Detection } from '../shared/detections';
import { classifyCrop, type Refined } from '../detection/classify';

/**
 * Names the selected box more precisely than COCO's 80 coarse classes by
 * running the 1000-class classifier on its crop. Only runs on tap, so it costs
 * nothing during a scan.
 */
export function useRefinedLabel({
  picked,
  result,
  clsModel,
  frameSize,
  photo,
  camera,
}: {
  picked: Detection | null;
  result: Detection[] | null;
  clsModel: TensorflowModel | undefined;
  frameSize: { w: number; h: number } | null;
  photo: SkImage | null;
  camera: RefObject<SkiaCameraRef | null>;
}) {
  const [refined, setRefined] = useState<Refined | null>(null);
  const [refining, setRefining] = useState(false);
  // Answers are memoised per box. Comparing objects back and forth is a very
  // natural gesture, and each ask costs nearly half a second for an answer that
  // cannot change. Keyed by the detection object itself, so a new `result`
  // invalidates everything.
  const cache = useRef(new Map<Detection, Refined | null>());

  // A fresh scan makes every box a new object, so old answers have nothing left
  // to hang off.
  useEffect(() => {
    cache.current.clear();
  }, [result]);

  useEffect(() => {
    setRefined(null);
    if (picked == null || clsModel == null || frameSize == null) return;
    // ImageNet-1k has NO person class, so a person crop can only come back as
    // some garment or backdrop. Don't ask what the model cannot answer.
    if (picked.classId === PERSON_CLASS_ID) return;

    // Already asked about this box: answer straight away, rebuilding neither the
    // input nor the inference — even when last time returned null.
    const cached = cache.current.get(picked);
    if (cached !== undefined) {
      setRefined(cached);
      return;
    }

    let cancelled = false;
    setRefining(true);

    // Yield exactly one frame so the detail sheet paints first. Building the
    // input is still synchronous, but at 224 it fits in a frame instead of the
    // ~126ms it took when the model ran at 640 — no need to defer harder.
    const frame = requestAnimationFrame(() => {
      // Same source as saving uses: the library photo, or the frozen canvas.
      const source = photo ?? camera.current?.takeSnapshot();
      if (source == null) {
        setRefining(false);
        return;
      }

      classifyCrop(
        clsModel,
        source,
        // The box is in frame space; map it onto the source image's pixels.
        boxToScreen(
          picked,
          frameSize.w,
          frameSize.h,
          source.width(),
          source.height(),
        ),
      )
        .then(r => {
          cache.current.set(picked, r);
          if (!cancelled) setRefined(r);
        })
        // Do NOT cache a failure: it may have been a one-off glitch.
        .catch(e => console.warn('[useRefinedLabel] classification failed', e))
        .finally(() => {
          if (!cancelled) setRefining(false);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [picked, clsModel, photo, frameSize, camera]);

  return { refined, refining };
}
