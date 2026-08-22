import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TensorflowModel } from 'react-native-fast-tflite';
import type { SkImage } from '@shopify/react-native-skia';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT, RADIUS } from '../shared/theme';
import { t } from '../i18n';
import { passesThreshold, type Detection } from '../shared/detections';
import { SCORE_THRESHOLD } from '../shared/constants';
import { enrolFace } from '../shared/faceProfiles';
import { readFaceBatch, SHARP_ENROL_MIN } from '../detection/faceEmbed';
import { scanImage } from '../detection/scanImage';
import { useEnter } from '../hooks/useEnter';
import { CtaButton } from '../components/CtaButton';
import { CheckMark } from '../components/Checkbox';
import { FaceGuide } from '../components/FaceGuide';
import { GlassSurface } from '../components/GlassSurface';
import { IconButton } from '../components/IconButton';

type Step = 'idle' | 'working' | 'done';

/** How long the saved state stays up before the camera takes over. */
const HOLD_MS = 1100;

/**
 * The angles captured in one enrolment, in the order they are asked for.
 *
 * Three, not one. The server embeds a whole batch in a single forward pass, so
 * three angles cost about what one did - and storing three means recognition
 * survives a head that is not pointed straight at the lens, which is most
 * heads most of the time. Straight on first because it is the shot most likely
 * to succeed, so a user who is going to fail the "exactly one face" check
 * fails it immediately rather than after turning twice.
 */
const ANGLES = ['front', 'left', 'right'] as const;

/**
 * How long the user gets to reach each angle before the shutter.
 *
 * Deliberately unhurried: the failure this avoids is a photo taken mid-turn,
 * which is blurred, off-axis, or both - and a blurred enrolment vector is the
 * one that quietly stops matching its owner for ever.
 */
const HOLD_PER_ANGLE_MS = 1400;

const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

/** What to ask for at each angle. Parallel to ANGLES by index. */
const ANGLE_TITLE = [
  'enrolFacingFront',
  'enrolFacingLeft',
  'enrolFacingRight',
] as const;

interface Props {
  /**
   * The two models, and a way to grab the current frame - all owned by
   * DetectorScreen.
   *
   * Passed in rather than loaded here, which is what this screen did at first.
   * react-native-fast-tflite reads each file whole into a Java byte array
   * before handing it to native, so a second set of loads asked for another
   * ~33MB contiguous buffer on top of a heap the camera and Skia already held
   * most of. It died on OutOfMemoryError inside ByteArrayOutputStream.grow the
   * moment a fresh account signed in.
   */
  detector: TensorflowModel;
  mesh: TensorflowModel;
  takeSnapshot: () => SkImage | null;
  /** Swaps the lens on the camera underneath. Enrolling yourself wants the
   *  front one; enrolling from a photo held up to the back one also happens,
   *  so this offers both rather than forcing a lens. */
  onFlip: () => void;
  onDone: () => void;
  onSkip: () => void;
}

/**
 * One line of status under the frame, in the same glass pill the scanning
 * label uses - a message that appears on its own should arrive like something
 * the screen produced, not like text that was always there and only just
 * became visible.
 *
 * Its own component so the entrance can be a hook: it mounts when there is
 * something to say and unmounts when there is not, which is exactly the
 * lifecycle useEnter animates, and hooks cannot be called conditionally in
 * the parent.
 */
function StatusChip({ tone, text }: { tone: 'error' | 'ok'; text: string }) {
  const enter = useEnter(0);
  const colour = tone === 'ok' ? COLORS.accent : '#FF453A';

  return (
    <Animated.View style={enter}>
      <GlassSurface pill contentStyle={styles.chipCore}>
        {tone === 'ok' ? (
          <CheckMark size={13} color={colour} />
        ) : (
          <View style={[styles.dot, { backgroundColor: colour }]} />
        )}
        <Text style={[styles.chipText, { color: colour }]}>{text}</Text>
      </GlassSurface>
    </Animated.View>
  );
}

/**
 * The face-enrolment step, shown once over the camera after an account first
 * has a session.
 *
 * An overlay on DetectorScreen rather than a screen of its own, so it inherits
 * the running camera and the already-loaded models instead of standing up a
 * second copy of both. Nothing here sits in a card: this is a mode of the
 * camera screen, and a panel parked over the bottom third covers the frame you
 * are lining your face up in. The camera is the background, the spotlight in
 * FaceGuide is the only surface, and the rest is type and one button laid
 * straight onto it.
 *
 * Gated on having a session rather than on the register form: registering can
 * end in 'confirm', where there is no session yet and so no row to attach an
 * embedding to. Gating on "signed in but not yet enrolled" covers that path,
 * the straight-through one, and accounts created before this feature existed.
 *
 * Scanning only - no fields. The display name is asked for on the register
 * form and rides along on the account (see useAuth's register), so enrolFace
 * reads it from the session rather than this step collecting it a second time.
 *
 * Reads a still rather than the preview stream: enrolment happens once, the
 * user is holding still on purpose, and a per-frame pipeline would duplicate
 * the whole of DetectorScreen for a button pressed once per account.
 */
export function EnrolFaceScreen({
  detector,
  mesh,
  takeSnapshot,
  onFlip,
  onDone,
  onSkip,
}: Props) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Which of ANGLES is being asked for right now. */
  const [angle, setAngle] = useState(0);
  /** The server did not answer the first time and is being given another go -
   *  almost always a sleeping instance waking up, which takes a while and
   *  deserves to be said out loud rather than left as a stalled spinner. */
  const [waking, setWaking] = useState(false);

  // The screen assembles itself top down instead of arriving whole - the same
  // hook and the same rhythm AuthScreen uses, so the two halves of setting up
  // an account feel like one piece of software.
  const eyebrowIn = useEnter(80);
  const titleIn = useEnter(170);
  const bodyIn = useEnter(240);
  const actionsIn = useEnter(360);
  const skipIn = useEnter(440);

  // Saved, so there is nothing left to decide - the tick and the ring going
  // solid are the whole message, and a button that only says "yes, I saw it"
  // is a tap standing between the user and the camera they came here to use.
  // Long enough to read, short enough not to feel stuck.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (step !== 'done') return;
    // Through a ref, so the deps stay `[step]`. onDone arrives as a fresh
    // arrow on every render of DetectorScreen, which re-renders constantly
    // behind this overlay - as a dep it would clear and restart the timer on
    // each frame, and the screen would sit on the tick forever.
    const id = setTimeout(() => doneRef.current(), HOLD_MS);
    return () => clearTimeout(id);
  }, [step]);

  const capture = useCallback(async () => {
    setStep('working');
    setError(null);
    setWaking(false);

    /** Ends the attempt with a message, back at the start. */
    const fail = (message: string) => {
      setError(message);
      setStep('idle');
      setAngle(0);
    };

    try {
      // Collected first, sent once. Every angle has to pass the same "exactly
      // one face" check the single shot used to: a batch is one person by
      // definition, and a second face wandering into the third frame would
      // enrol a stranger's vector under this account with nothing to show it.
      const shots: { image: SkImage; detection: Detection }[] = [];

      for (let i = 0; i < ANGLES.length; i++) {
        setAngle(i);
        await wait(HOLD_PER_ANGLE_MS);

        const shot = takeSnapshot();
        if (shot == null) return fail(t('enrolFailed'));

        const found = (await scanImage(detector, shot)) ?? [];
        const faces = found.filter(d => passesThreshold(d, SCORE_THRESHOLD));
        if (faces.length === 0) return fail(t('enrolNoFace'));
        if (faces.length > 1) return fail(t('enrolManyFaces'));

        shots.push({ image: shot, detection: faces[0]! });
      }

      const read = await readFaceBatch(mesh, shots, {
        onRetry: () => setWaking(true),
      });
      if (!read.ok) {
        const why =
          read.reason === 'pose'
            ? t('enrolTurned')
            : read.reason === 'offline'
            ? t('faceOffline')
            : read.reason === 'blurry'
            ? t('faceBlurry')
            : read.reason === 'config'
            ? t('faceMisconfigured')
            : t('enrolFailed');
        // Which shot, when it was one shot in particular. "Take it again" is
        // maddening advice when three were taken and only the third was bad.
        return fail(
          read.index == null
            ? why
            : t('enrolShotFailed', { why, n: read.index + 1 }),
        );
      }

      // Refused here rather than left to the server, which accepts far softer
      // images than an enrolment should keep. A blurred angle produces a
      // vector that looks entirely normal and describes nobody, and it is then
      // among the things every future scan is compared against.
      const soft = read.reading.sharp.findIndex(
        v => v != null && v < SHARP_ENROL_MIN,
      );
      if (soft >= 0) {
        return fail(
          t('enrolShotFailed', { why: t('enrolBlurry'), n: soft + 1 }),
        );
      }

      const saved = await enrolFace(
        read.reading.embeddings,
        read.reading.model,
      );
      if (!saved) return fail(t('enrolFailed'));
      setStep('done');
    } catch (e) {
      console.warn('[EnrolFaceScreen] enrolment failed', e);
      fail(t('enrolFailed'));
    }
  }, [detector, mesh, takeSnapshot]);

  return (
    <View style={styles.root}>
      <FaceGuide state={step} />

      <View
        style={[
          styles.layer,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 },
        ]}
      >
        {/* Top right, where DetectorScreen's own utility pill sits while this
            overlay is not up - a lens choice belongs with the other things you
            set before shooting, not next to the button that does the shooting.
            Beside the CTA it read as a second, equal action; up here there is
            one thing to press and one setting to change. */}
        {step !== 'done' && (
          <Animated.View
            style={[styles.flipAnchor, { top: insets.top + 33 }, eyebrowIn]}
          >
            <GlassSurface pill contentStyle={styles.flipCore}>
              <IconButton
                name="flip"
                label={t('flipCamera')}
                disabled={step === 'working'}
                onPress={onFlip}
              />
            </GlassSurface>
          </Animated.View>
        )}

        <View style={styles.copy}>
          <Animated.View style={eyebrowIn}>
            <GlassSurface pill contentStyle={styles.eyebrowCore}>
              <View style={styles.dot} />
              <Text style={styles.eyebrow}>{t('enrolEyebrow')}</Text>
            </GlassSurface>
          </Animated.View>

          <Animated.Text style={[styles.title, titleIn]}>
            {step === 'working' ? t(ANGLE_TITLE[angle]!) : t('enrolTitle')}
          </Animated.Text>
          <Animated.Text style={[styles.body, bodyIn]}>
            {step === 'working'
              ? t('enrolProgress', { n: angle + 1, total: ANGLES.length })
              : t('enrolBody')}
          </Animated.Text>
        </View>

        <View style={styles.footer}>
          {error != null && <StatusChip tone="error" text={error} />}
          {waking && step === 'working' && (
            <StatusChip tone="ok" text={t('enrolWaking')} />
          )}
          {step === 'done' && <StatusChip tone="ok" text={t('enrolDone')} />}

          {step !== 'done' && (
            <Animated.View style={actionsIn}>
              <CtaButton
                label={step === 'working' ? t('enrolScanning') : t('enrolCta')}
                loading={step === 'working'}
                onPress={capture}
              />
            </Animated.View>
          )}

          {step !== 'done' && (
            <Animated.Text style={[styles.skip, skipIn]} onPress={onSkip}>
              {t('enrolSkip')}
            </Animated.Text>
          )}
        </View>
      </View>
    </View>
  );
}

// Nothing behind the type but a camera frame, so every label carries its own
// shadow. White on a bright wall is otherwise unreadable, and the alternative
// - a plate behind the text - is the card this screen deliberately does not
// have.
const SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.7)',
  textShadowRadius: 10,
} as const;

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  // The dim lives in FaceGuide's scrim, which has a hole cut in it - this
  // layer only positions type, and must not paint over the hole.
  layer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },

  copy: { alignItems: 'center', gap: 14 },
  eyebrowCore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  eyebrow: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  title: {
    color: COLORS.textPrimary,
    fontFamily: FONT.bold,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -1.1,
    textAlign: 'center',
    ...SHADOW,
  },
  body: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    ...SHADOW,
  },

  footer: { alignItems: 'center', gap: 16 },
  // 16 from the edge, the same as DetectorScreen's header pill this stands in
  // for while enrolment is up. The layer's own horizontal padding does not
  // apply to an absolute child, so this is the whole distance.
  flipAnchor: { position: 'absolute', right: 16 },
  // Zero padding: IconButton is already a 40pt circle, so the bezel wraps it
  // directly and the shell's own rim is the whole frame.
  flipCore: { padding: 0 },
  chipCore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: { fontFamily: FONT.medium, fontSize: 12.5, letterSpacing: -0.1 },

  skip: {
    color: COLORS.textFaint,
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingVertical: 6,
    borderRadius: RADIUS.pillShell,
    ...SHADOW,
  },
});
