import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SectionList,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../shared/theme';
import {
  clockTime,
  groupByDay,
  totalOf,
  WEEK_DAYS,
  weekTotals,
  type ScanRecord,
} from '../shared/history';
import { t } from '../i18n';
import { toCsv } from '../shared/export';
import { CloseIcon } from './modalIcons';
import { Checkbox, CheckMark } from './Checkbox';

// Views, not the Skia <Icon>: a Skia Canvas draws nothing inside an RN Modal
// on Android, because the Modal gets its own window and surface. Every icon in
// here would silently render blank - which is exactly what happened the first
// time. PhotoPicker, also a Modal, already uses the same approach. CloseIcon
// itself now lives in modalIcons.tsx, shared with SettingsScreen; the two
// below are only used here.
//
// They used to be Text glyphs instead ('↓', '☑', '✕') - simpler, but each one
// is a different font falling back in a different way on a different device,
// which is why they never quite lined up with each other or with Checkbox's
// hand-drawn ring. Geist has no glyph for most of them, so Android silently
// substituted the system font per character - see the same note in
// Checkbox.tsx. Redrawing them from the same bars-and-borders technique as
// Checkbox gives every header icon the exact same box to sit in, so a flex
// row centres them all on the same line for real instead of by font luck.
//
// Both are outlines, not filled silhouettes: icons.tsx draws every Skia icon
// as a thin even stroke, and the filled shapes these replaced read as heavier
// and cruder than everything they sat next to.

/**
 * An arrow rising out of an open tray - share the history as CSV.
 *
 * Replaces a cloud, which was wrong twice over: it was a solid silhouette in
 * an app whose every other icon is a thin stroke, and a cloud means sync or
 * upload to a server, which this does not do - pressing it opens the system
 * share sheet with local text. This is `icons.tsx`'s `download` glyph
 * (arrow into a tray) with the arrow reversed, so the two read as a pair.
 *
 * The tray is one View with its top border switched off rather than three
 * separate bars - a border already draws the corners for free.
 */
function ShareIcon({
  size = 20,
  color = COLORS.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(1.6, size * 0.085);
  const tip = { x: size / 2, y: size * 0.14 };
  const armLen = size * 0.28;
  // Half the arm laid along its own 45-degree diagonal, so each arm starts at
  // the tip rather than being centred on it.
  const armOffset = (armLen / 2) * Math.SQRT1_2;

  const arm = (dx: number, deg: number) => ({
    position: 'absolute' as const,
    width: armLen,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
    left: tip.x + dx * armOffset - armLen / 2,
    top: tip.y + armOffset - stroke / 2,
    transform: [{ rotate: `${deg}deg` }],
  });

  return (
    <View style={{ width: size, height: size }}>
      {/* Tray: left, right and bottom edges only. */}
      <View
        style={{
          ...styles.tray,
          left: size * 0.16,
          top: size * 0.52,
          right: size * 0.16,
          bottom: size * 0.12,
          borderWidth: stroke,
          borderColor: color,
          borderBottomLeftRadius: size * 0.12,
          borderBottomRightRadius: size * 0.12,
        }}
      />
      {/* Shaft, running from the tip down into the tray. */}
      <View
        style={{
          ...styles.absPos,
          left: size / 2 - stroke / 2,
          top: tip.y,
          width: stroke,
          height: size * 0.44,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
      <View style={arm(-1, -45)} />
      <View style={arm(1, 45)} />
    </View>
  );
}

/**
 * A ticked box above a plain one - the entry point into selection mode.
 *
 * Says "some of these, not all" in a way a single box cannot, which is what
 * the mode is for. Both boxes are hollow outlines rather than the filled
 * Checkbox this used before: filled means "already selected", and nothing is
 * selected yet at the moment this button is pressed. The tick is Checkbox's
 * own CheckMark, so the glyph introducing selection and the glyph marking a
 * selected row are the same drawing.
 */
function SelectIcon({
  size = 20,
  color = COLORS.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(1.5, size * 0.08);
  const box = size * 0.46;
  const radius = size * 0.09;

  const outline = (top: number) => ({
    ...styles.absPos,
    left: 0,
    top,
    width: box,
    height: box,
    borderWidth: stroke,
    borderColor: color,
    borderRadius: radius,
  });
  const line = (top: number) => ({
    ...styles.absPos,
    left: box + size * 0.16,
    top: top + box / 2 - stroke / 2,
    right: 0,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
  });

  const topRow = 0;
  const bottomRow = size - box;

  return (
    <View style={{ width: size, height: size }}>
      <View style={outline(topRow)} />
      {/* Inset by the border so the tick sits in the box's hole, not on it. */}
      <View style={{ ...styles.absPos, left: stroke, top: topRow + stroke }}>
        <CheckMark size={box - stroke * 2} color={color} />
      </View>
      <View style={line(topRow)} />

      <View style={outline(bottomRow)} />
      <View style={line(bottomRow)} />
    </View>
  );
}

/**
 * How long a row takes to fade before it is actually dropped.
 *
 * Fade first, delete second - the row animates while still mounted and still
 * occupying its place in the list. Three shorter routes were tried on device
 * first and all three failed:
 *
 * - Reanimated `LinearTransition` moves each row on its own while SectionList
 *   keeps positioning its sticky day headers, and the two disagree for the
 *   length of the animation: a header lands on top of the row above it.
 * - Reanimated `exiting` detaches the row from layout, so the list closes the
 *   gap at once and the fading ghost sits over whatever moved up.
 * - `LayoutAnimation` does nothing at all here - it is not implemented on the
 *   New Architecture, and the row just vanishes.
 *
 * Animating a mounted row avoids all of it: nothing is detached, so there is
 * no second copy to collide with anything.
 */
const FADE_MS = 200;

/** "3 khuôn mặt", or the empty-scan message. */
function breakdown(record: ScanRecord): string {
  if (record.faces === 0) return t('nothingFound');
  return t('faceCount', { count: record.faces });
}

function Row({
  record,
  selecting,
  selected,
  dying,
  onOpen,
  onToggle,
  onRemove,
}: {
  record: ScanRecord;
  selecting: boolean;
  selected: boolean;
  /** On its way out - fade before the parent drops it. */
  dying: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming(dying ? 0 : 1, { duration: FADE_MS });
  }, [dying, fade]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: 0.94 + 0.06 * fade.value }],
  }));

  return (
    <Animated.View style={fadeStyle} pointerEvents={dying ? 'none' : 'auto'}>
    <Pressable
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={
        selecting ? (selected ? t('deselectRow') : t('selectRow')) : t('openScan')
      }
      onPress={selecting ? onToggle : onOpen}
      // Long press is how a list like this is normally put into selection mode,
      // and it saves reaching for the header to start.
      onLongPress={onToggle}
    >
      {record.thumbnail !== '' && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${record.thumbnail}` }}
          style={styles.thumb}
        />
      )}

      <View style={styles.rowText}>
        {/* Two lines: a scan with several classes, or the "nothing found"
            message, does not fit on one at this width. */}
        <Text style={styles.rowTitle} numberOfLines={2}>
          {breakdown(record)}
        </Text>
        <Text style={styles.rowMeta}>{clockTime(record.at)}</Text>
      </View>

      {selecting ? (
        <Checkbox selected={selected} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('removeScan')}
          hitSlop={12}
          onPress={onRemove}
        >
          <CloseIcon size={18} color={COLORS.textMuted} />
        </Pressable>
      )}
    </Pressable>
    </Animated.View>
  );
}


/**
 * One past scan, opened full-bleed over the list.
 *
 * An absolutely positioned overlay inside the sheet's own Modal, not a second
 * Modal on top of it: stacking Modals on Android means two windows fighting
 * over the same back button, and the enter animation of the inner one plays
 * against the outer one's.
 *
 * The preview is read on open rather than held with the record, so scrolling a
 * list of fifty never pays for images nobody asked to see. Scans saved before
 * previews existed have none - those fall back to the row thumbnail, which is
 * small and centre-cropped but still says which scan this was.
 */
function Viewer({
  record,
  loadPreview,
  onClose,
}: {
  record: ScanRecord;
  loadPreview: (id: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadPreview(record.id)
      .then(data => {
        if (cancelled) return;
        setPreview(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record.id, loadPreview]);

  const source = preview ?? (record.thumbnail !== '' ? record.thumbnail : null);

  return (
    // The inset is applied again here even though the sheet's root already pads
    // for it: Yoga positions an absolute child against the parent's border box,
    // not its padding box, so top:0 lands under the status bar. Verified on
    // device - the header clock drew over the system clock without this.
    <View style={[styles.viewer, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{clockTime(record.at)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          hitSlop={16}
          onPress={onClose}
        >
          <CloseIcon />
        </Pressable>
      </View>

      <View style={styles.viewerImage}>
        {loading ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : source == null ? (
          <Text style={styles.message}>{t('noPreview')}</Text>
        ) : (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${source}` }}
              // The fallback is a 96px row thumbnail. Blown up to the full width
              // it turns to mush and reads as a broken photo rather than an old
              // record, so it is held near its own size and captioned instead.
              style={[styles.viewerPhoto, preview == null && styles.viewerThumb]}
              // contain, not cover: a count is about what was in the frame, and
              // cropping to fill could hide the very thing that was counted.
              resizeMode="contain"
            />
            {preview == null && (
              <Text style={styles.viewerNote}>{t('noPreview')}</Text>
            )}
          </>
        )}
      </View>

      <View style={[styles.viewerFoot, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.viewerTotals}>
          {t('faceCount', { count: record.faces })}
        </Text>
        {/* Not clamped to two lines like the row: this is the screen you open
            precisely because the row was too short to list everything. */}
        <Text style={styles.viewerBreakdown}>{breakdown(record)}</Text>
      </View>
    </View>
  );
}

/**
 * Past scans. The app is called Tally - a count that vanishes when you press
 * the shutter again is not much of a tally.
 *
 * `now` is captured once when the sheet mounts rather than ticking: it only
 * decides which day counts as "Hôm nay", and nobody keeps the sheet open across
 * a midnight.
 */
export function HistorySheet({
  records,
  batch,
  loadPreview,
  onRemoveMany,
  older,
  onLoadOlder,
  loadingOlder,
  canLoadOlder,
  onClose,
}: {
  records: ScanRecord[];
  /** Ids from a run that just finished, summarised above the list. */
  batch?: string[] | null;
  loadPreview: (id: string) => Promise<string | null>;
  /** One row or a whole selection - both go through the same fade. */
  onRemoveMany: (ids: readonly string[]) => void;
  /**
   * Scans past the local cap, paged back in from the cloud. Displayed after
   * `records` and otherwise treated the same - see the note on `visible`.
   */
  older: ScanRecord[];
  onLoadOlder: () => void;
  loadingOlder: boolean;
  canLoadOlder: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [now] = useState(() => Date.now());

  /**
   * Everything on screen: the local history, then whatever has been paged in
   * behind it. Both are already newest-first and `older` starts where
   * `records` ends, so concatenating keeps the whole list in order without a
   * sort.
   *
   * Every read below works off this rather than `records` - grouping,
   * totals, select-all, the CSV. Writes still go out as plain ids through
   * onRemoveMany, which knows which of the two lists an id came from.
   */
  const visible = useMemo(() => [...records, ...older], [records, older]);

  const sections = useMemo(() => groupByDay(visible, now), [visible, now]);
  const week = useMemo(() => weekTotals(visible, now), [visible, now]);

  // The id, not the record: deleting the open scan from underneath should shut
  // the viewer rather than leave a stale copy on screen.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = visible.find(r => r.id === openId) ?? null;

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Rows fading out. They are still in `records` - the real removal happens one
  // FADE_MS later, so the list does not close the gap while the fade is running.
  const [dying, setDying] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const requestRemove = useCallback(
    (ids: readonly string[]) => {
      setDying(new Set(ids));
      timers.current.push(
        setTimeout(() => {
          onRemoveMany(ids);
          setDying(new Set());
        }, FADE_MS),
      );
    },
    [onRemoveMany],
  );

  const endSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  // Toggling also enters selection mode, so a long press on a row starts it
  // without a trip to the header.
  const toggle = useCallback((id: string) => {
    setSelecting(true);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Against the list, not a counter: a row that fades out while the sheet is
  // open changes what "all" means - and so does paging older scans in.
  const allSelected = visible.length > 0 && selected.size === visible.length;
  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === visible.length ? new Set() : new Set(visible.map(r => r.id)),
    );
  }, [visible]);

  const removeSelected = useCallback(() => {
    requestRemove([...selected]);
    endSelect();
  }, [requestRemove, selected, endSelect]);

  // Filtered against `records` rather than trusted wholesale, so a row deleted
  // while the sheet is open drops out of the total too.
  const summary =
    batch == null ? null : totalOf(visible.filter(r => batch.includes(r.id)));

  // The share sheet, not a file: RN's Share is already in core, and a count
  // pasted into a spreadsheet or a chat is what people actually do with it.
  // Writing a .csv would mean a filesystem dependency and a FileProvider to
  // hand the URI across the process boundary, for the same text.
  //
  // Exports the selection when there is one. Selection mode already knows
  // which rows the user means, so making them export the whole history and
  // delete the rest in a spreadsheet would be asking them to say it twice.
  const shareCsv = useCallback(() => {
    const subset = selecting ? visible.filter(r => selected.has(r.id)) : visible;
    Share.share({ message: toCsv(subset), title: t('shareSubject') }).catch(e =>
      console.warn('[HistorySheet] could not share the history', e),
    );
  }, [visible, selecting, selected]);

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      // Back unwinds in the order things were opened: the viewer, then
      // selection mode, then the sheet itself.
      onRequestClose={
        open != null ? () => setOpenId(null) : selecting ? endSelect : onClose
      }
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('historyTitle')}</Text>

          <View style={styles.headerActions}>
            {selecting && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allSelected }}
                accessibilityLabel={allSelected ? t('deselectAll') : t('selectAll')}
                hitSlop={12}
                onPress={toggleAll}
              >
                <Checkbox selected={allSelected} size={20} />
              </Pressable>
            )}
            {/* Stays up in selection mode, where it exports the selection -
                hiding it there would leave no way to reach that at all. With
                nothing ticked there is nothing to export, so it goes out
                rather than sharing an empty file. */}
            {visible.length > 0 && (!selecting || selected.size > 0) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('shareHistory')}
                hitSlop={12}
                onPress={shareCsv}
              >
                <ShareIcon size={20} />
              </Pressable>
            )}
            {visible.length > 0 && !selecting && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('selectScans')}
                hitSlop={12}
                onPress={() => setSelecting(true)}
              >
                <SelectIcon size={20} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              hitSlop={16}
              onPress={onClose}
            >
              <CloseIcon />
            </Pressable>
          </View>
        </View>

        {visible.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.message}>{t('historyEmpty')}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={r => r.id}
            // Sticky, so the day a row belongs to stays on screen while its
            // section scrolls past - the point of grouping in the first place.
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <Text style={styles.dayHeader}>{section.title}</Text>
            )}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + (selecting ? 88 : 24) },
            ]}
            ListHeaderComponent={
              <>
                {summary != null && summary.photos > 1 && (
                  <View style={styles.summary}>
                    <Text style={styles.summaryTitle}>
                      {t('batchTitle', { count: summary.photos })}
                    </Text>
                    <Text style={styles.summaryLine}>
                      {t('faceCount', { count: summary.faces })}
                    </Text>
                  </View>
                )}

                {/* Below the batch block, not above it: a batch summary is
                    about the run that just finished and is what the sheet was
                    opened to see, while this is standing context. Hidden when
                    the window is empty - a row of zeroes says nothing that an
                    absent strip does not. */}
                {week.photos > 0 && (
                  <View style={styles.week}>
                    <Text style={styles.weekTitle}>
                      {t('weekTitle', { days: WEEK_DAYS })}
                    </Text>
                    <Text style={styles.weekLine}>
                      {t('weekTotal', {
                        scans: t('scanCount', { count: week.photos }),
                        faces: t('faceCount', { count: week.faces }),
                      })}
                    </Text>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <Row
                record={item}
                selecting={selecting}
                selected={selected.has(item.id)}
                dying={dying.has(item.id)}
                onOpen={() => setOpenId(item.id)}
                onToggle={() => toggle(item.id)}
                onRemove={() => requestRemove([item.id])}
              />
            )}
            // A button rather than onEndReached: each page downloads a
            // thumbnail per row, so pulling one automatically every time the
            // list bottoms out would spend someone's data on scans they only
            // scrolled past.
            ListFooterComponent={
              canLoadOlder ? (
                <Pressable
                  style={styles.loadOlder}
                  accessibilityRole="button"
                  disabled={loadingOlder}
                  onPress={onLoadOlder}
                >
                  {loadingOlder ? (
                    <ActivityIndicator color={COLORS.textMuted} />
                  ) : (
                    <Text style={styles.loadOlderText}>{t('loadOlder')}</Text>
                  )}
                </Pressable>
              ) : null
            }
          />
        )}

        {selecting && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={[styles.danger, selected.size === 0 && styles.muted]}
              accessibilityRole="button"
              // Nothing selected means nothing to delete - greyed and inert
              // rather than hidden, so the button does not jump around.
              disabled={selected.size === 0}
              onPress={removeSelected}
            >
              <Text style={styles.dangerText}>
                {t('deleteSelected', { n: selected.size })}
              </Text>
            </Pressable>
            <Pressable
              style={styles.clear}
              accessibilityRole="button"
              onPress={endSelect}
            >
              <Text style={styles.clearText}>{t('cancelSelect')}</Text>
            </Pressable>
          </View>
        )}

        {open != null && (
          <Viewer
            record={open}
            loadPreview={loadPreview}
            onClose={() => setOpenId(null)}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  absPos: { position: 'absolute' },
  // borderWidth is set per size at the call site; only the missing top edge
  // that makes the box an open tray is constant.
  tray: { position: 'absolute', borderTopWidth: 0 },
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  message: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  list: { paddingHorizontal: 16 },
  viewer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#050505',
  },
  viewerImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  viewerPhoto: { width: '100%', height: '100%', borderRadius: 18 },
  viewerThumb: { width: 168, height: 168, borderRadius: 20 },
  viewerNote: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 260,
  },
  viewerFoot: { paddingHorizontal: 24, paddingTop: 20, gap: 6 },
  viewerTotals: {
    color: COLORS.textPrimary,
    fontFamily: FONT.semibold,
    fontSize: 16,
  },
  viewerBreakdown: {
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  dayHeader: {
    color: COLORS.textMuted,
    fontFamily: FONT.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    paddingTop: 14,
    paddingBottom: 6,
    // Opaque: a sticky header scrolls rows underneath itself.
    backgroundColor: '#050505',
  },
  summary: {
    padding: 14,
    marginBottom: 4,
    borderRadius: 16,
    gap: 4,
    backgroundColor: 'rgba(0,230,118,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,230,118,0.35)',
  },
  summaryTitle: {
    color: COLORS.accent,
    fontFamily: FONT.semibold,
    fontSize: 14,
  },
  summaryLine: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  // Deliberately quieter than the batch block above: that one is a result, this
  // is background. Same padding so the two stack as one column when both show.
  week: {
    padding: 14,
    marginBottom: 4,
    borderRadius: 16,
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.hairline,
  },
  weekTitle: {
    color: COLORS.textFaint,
    fontFamily: FONT.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  weekLine: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  // Fixed height so swapping the label for the spinner does not make the list
  // jump under the finger that just pressed it.
  loadOlder: {
    height: 44,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  loadOlderText: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
  row: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowSelected: {
    backgroundColor: 'rgba(0,230,118,0.16)',
  },
  thumb: { width: 52, height: 52, borderRadius: 11 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  rowMeta: {
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 12,
    backgroundColor: '#050505',
  },
  danger: {
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 26,
    backgroundColor: '#FF453A',
  },
  dangerText: {
    color: '#FFFFFF',
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
  muted: { backgroundColor: 'rgba(255,255,255,0.08)' },
  clear: {
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clearText: {
    color: COLORS.textPrimary,
    fontFamily: FONT.medium,
    fontSize: 13,
  },
});
