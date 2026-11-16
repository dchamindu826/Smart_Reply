import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { BreakEntry } from '@smart-reply/shared';
import { useMyBreaks } from '@/features/me/hooks';
import { clockTime, dayLabel, minutesLabel } from '@/lib/time';
import { EmptyView, ErrorView, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

const SCOPE: Record<BreakEntry['scope'], string> = { both: 'Calls and chats', call: 'Calls', chat: 'Chats' };

export default function BreaksScreen() {
  const t = useTheme();
  const breaks = useMyBreaks();
  if (breaks.isPending) return <Loading />;
  if (breaks.isError) return <ErrorView error={breaks.error} onRetry={() => void breaks.refetch()} />;
  const { usedMinutes, limitMinutes, entries } = breaks.data;
  const over = limitMinutes !== undefined && usedMinutes > limitMinutes;
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={entries}
      keyExtractor={b => b.id}
      ListHeaderComponent={
        <View style={[styles.summary, { backgroundColor: t.card2 }]}>
          <Text style={[styles.big, { color: over ? t.bad : t.text }]}>{minutesLabel(usedMinutes)}</Text>
          <Text style={[styles.sub, { color: t.text2 }]}>
            {limitMinutes !== undefined ? `used of ${minutesLabel(limitMinutes)} allowed today` : 'on break today'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { borderBottomColor: t.rule }]} accessible>
          <View style={styles.flex}>
            <Text style={[styles.reason, { color: t.text }]}>{item.reason || 'Break'}</Text>
            <Text style={[styles.meta, { color: t.text2 }]}>
              {dayLabel(item.startedAt)} · {clockTime(item.startedAt)}–{item.endedAt ? clockTime(item.endedAt) : 'now'} · {SCOPE[item.scope]}
            </Text>
          </View>
          <Text style={[styles.minutes, { color: item.endedAt ? t.text : t.warn }]}>{minutesLabel(item.minutes)}</Text>
        </View>
      )}
      refreshControl={<RefreshControl refreshing={breaks.isRefetching} onRefresh={() => void breaks.refetch()} colors={[t.primary]} tintColor={t.primary} />}
      ListEmptyComponent={<EmptyView icon="cafe-outline" title="No breaks yet today" />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { margin: 16, padding: 16, borderRadius: 12 },
  big: { fontSize: 30, fontWeight: '800' },
  sub: { fontSize: 14, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  reason: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  minutes: { fontSize: 15, fontWeight: '700' }
});
