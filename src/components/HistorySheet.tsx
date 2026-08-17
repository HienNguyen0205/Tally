import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../shared/theme';
import { relativeTime, totalOf, type ScanRecord } from '../shared/history';
import { label } from '../shared/labels';
import { t } from '../shared/strings';

// Glyphs rather than the Skia <Icon>: a Skia Canvas draws nothing inside an RN
// Modal on Android, because the Modal gets its own window and surface. Every
// icon in here would silently render blank - which is exactly what happened the
// first time. PhotoPicker, also a Modal, already uses a glyph for the same
// reason.

/** "3 người, 2 thuyền, 1 ghế" - the classes that were actually found. */
function breakdown(record: ScanRecord): string {
  if (record.counts.length === 0) return t.nothingFound;
  return record.counts
    .map(c => t.countOf(c.count, label(c.classId)))
    .join(', ');
}

function Row({
  record,
  now,
  onRemove,
}: {
  record: ScanRecord;
  now: number;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
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
        <Text style={styles.rowMeta}>{relativeTime(record.at, now)}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.removeScan}
        hitSlop={12}
        onPress={onRemove}
      >
        <Text style={styles.rowClose}>✕</Text>
      </Pressable>
    </View>
  );
}

/**
 * Past scans. The app is called Tally - a count that vanishes when you press
 * the shutter again is not much of a tally.
 *
 * `now` is captured once when the sheet mounts rather than ticking: the rows say
 * "5 phút trước", and nobody watches a list long enough for that to go stale.
 */
export function HistorySheet({
  records,
  batch,
  onRemove,
  onClear,
  onClose,
}: {
  records: ScanRecord[];
  /** Ids from a run that just finished, summarised above the list. */
  batch?: string[] | null;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [now] = React.useState(() => Date.now());

  // Filtered against `records` rather than trusted wholesale, so a row deleted
  // while the sheet is open drops out of the total too.
  const summary =
    batch == null ? null : totalOf(records.filter(r => batch.includes(r.id)));

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.historyTitle}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.close}
            hitSlop={16}
            onPress={onClose}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {records.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.message}>{t.historyEmpty}</Text>
          </View>
        ) : (
          <FlatList
            data={records}
            keyExtractor={r => r.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + 88 },
            ]}
            ListHeaderComponent={
              summary != null && summary.photos > 1 ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>
                    {t.batchTitle(summary.photos)}
                  </Text>
                  <Text style={styles.summaryLine}>
                    {t.batchTotal(summary.people, summary.total)}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Row
                record={item}
                now={now}
                onRemove={() => onRemove(item.id)}
              />
            )}
          />
        )}

        {records.length > 0 && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={styles.clear}
              accessibilityRole="button"
              onPress={onClear}
            >
              <Text style={styles.clearText}>{t.clearHistory}</Text>
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
  list: { paddingHorizontal: 16, gap: 8 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    alignItems: 'center',
    paddingTop: 12,
    backgroundColor: '#050505',
  },
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
