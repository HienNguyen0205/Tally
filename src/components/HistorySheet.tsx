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
  type ScanRecord,
} from '../shared/history';
import { labelForCount } from '../shared/labels';
import { t } from '../i18n';
import { toCsv } from '../shared/export';
import { CloseIcon } from './modalIcons';
import { Checkbox } from './Checkbox';

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
// hand-drawn ring. Redrawing them from the same bars-and-circles technique as
// Checkbox gives every header icon the exact same box to sit in, so a flex
// row centres them all on the same line for real instead of by font luck.

/**
 * A cloud, for exporting the history as CSV. Three overlapping circles plus a
 * rounded base, all the same solid colour - since nothing shows through, the
 * overlaps disappear and the four shapes read as one silhouette. No arrow: a
 * share sheet, not a literal download, comes up when this is pressed.
 */
function CloudIcon({
  size = 20,
  color = COLORS.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const puff = (cx: number, cy: number, r: number) => ({
    position: 'absolute' as const,
    left: size * cx - size * r,
    top: size * cy - size * r,
    width: size * r * 2,
    height: size * r * 2,
    borderRadius: size * r,
    backgroundColor: color,
  });
  return (
    <View style={{ width: size, height: size }}>
      <View style={puff(0.5, 0.42, 0.27)} />
      <View style={puff(0.29, 0.58, 0.19)} />
      <View style={puff(0.7, 0.56, 0.21)} />
      <View
        style={{
          position: 'absolute',
          left: size * 0.14,
          top: size * 0.52,
          width: size * 0.72,
          height: size * 0.3,
          borderRadius: size * 0.15,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * A small checked box with two list lines - the entry point into selection
 * mode. Reuses Checkbox itself for the box, rather than drawing a second
 * near-identical ring, so the one place selection is introduced already looks
 * like the state it is about to turn on.
 */
function ListCheckIcon({ size = 20 }: { size?: number }) {
  const box = size * 0.48;
  const gap = size * 0.12;
  const barW = size - box - gap;
  const barH = Math.max(1.5, size * 0.1);
  const bar = (top: number) => ({
    position: 'absolute' as const,
    left: box + gap,
    top,
    width: barW,
    height: barH,
    borderRadius: barH / 2,
    backgroundColor: COLORS.textPrimary,
  });
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: (size - box) / 2 }}>
        <Checkbox selected size={box} />
      </View>
      <View style={bar(size * 0.36 - barH / 2)} />
      <View style={bar(size * 0.64 - barH / 2)} />
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

/** "3 người, 2 thuyền, 1 ghế" - the classes that were actually found. */
function breakdown(record: ScanRecord): string {
  if (record.counts.length === 0) return t('nothingFound');
  return record.counts
    .map(c => t('countOf', { count: c.count, name: labelForCount(c.classId, c.count) }))
    .join(', ');
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
          <Text style={styles.rowClose}>✕</Text>
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
          {t('batchTotal', {
            people: t('peopleCount', { count: record.people }),
            total: t('objectCount', { count: record.total }),
          })}
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
  onClose,
}: {
  records: ScanRecord[];
  /** Ids from a run that just finished, summarised above the list. */
  batch?: string[] | null;
  loadPreview: (id: string) => Promise<string | null>;
  /** One row or a whole selection - both go through the same fade. */
  onRemoveMany: (ids: readonly string[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const [now] = useState(() => Date.now());
  const sections = useMemo(() => groupByDay(records, now), [records, now]);

  // The id, not the record: deleting the open scan from underneath should shut
  // the viewer rather than leave a stale copy on screen.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = records.find(r => r.id === openId) ?? null;

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

  // Against `records`, not a counter: a row that fades out while the sheet is
  // open changes what "all" means.
  const allSelected = records.length > 0 && selected.size === records.length;
  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === records.length ? new Set() : new Set(records.map(r => r.id)),
    );
  }, [records]);

  const removeSelected = useCallback(() => {
    requestRemove([...selected]);
    endSelect();
  }, [requestRemove, selected, endSelect]);

  // Filtered against `records` rather than trusted wholesale, so a row deleted
  // while the sheet is open drops out of the total too.
  const summary =
    batch == null ? null : totalOf(records.filter(r => batch.includes(r.id)));

  // The share sheet, not a file: RN's Share is already in core, and a count
  // pasted into a spreadsheet or a chat is what people actually do with it.
  // Writing a .csv would mean a filesystem dependency and a FileProvider to
  // hand the URI across the process boundary, for the same text.
  const shareCsv = useCallback(() => {
    Share.share({ message: toCsv(records), title: t('shareSubject') }).catch(e =>
      console.warn('[HistorySheet] could not share the history', e),
    );
  }, [records]);

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
            {records.length > 0 && !selecting && (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('shareHistory')}
                  hitSlop={12}
                  onPress={shareCsv}
                >
                  <CloudIcon size={20} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('selectScans')}
                  hitSlop={12}
                  onPress={() => setSelecting(true)}
                >
                  <ListCheckIcon size={20} />
                </Pressable>
              </>
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

        {records.length === 0 ? (
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
              summary != null && summary.photos > 1 ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>
                    {t('batchTitle', { count: summary.photos })}
                  </Text>
                  <Text style={styles.summaryLine}>
                    {t('batchTotal', {
                      people: t('peopleCount', { count: summary.people }),
                      total: t('objectCount', { count: summary.total }),
                    })}
                  </Text>
                </View>
              ) : null
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
  rowClose: {
    color: COLORS.textMuted,
    fontFamily: FONT.medium,
    fontSize: 15,
    paddingHorizontal: 4,
  },
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
