import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PerformanceResponse } from '@smart-reply/shared';
import { useMyPerformance } from '@/features/me/hooks';
import { minutesLabel, replySeconds } from '@/lib/time';
import { StatGrid } from '@/me/StatGrid';
import { Chip } from '@/ui/Chip';
import { SectionTitle } from '@/ui/Row';
import { ErrorView, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

type Range = 'today' | '7d' | '30d' | 'month';
const RANGES: { range: Range; label: string }[] = [
  { range: 'today', label: 'Today' },
  { range: '7d', label: '7 days' },
  { range: '30d', label: '30 days' },
  { range: 'month', label: 'This month' }
];

function DailyBars({ daily }: { daily: PerformanceResponse['daily'] }) {
  const t = useTheme();
  const max = Math.max(1, ...daily.map(d => d.resolved));
  return (
    <View style={styles.chart} accessibilityLabel={`Resolved per day: ${daily.map(d => `${d.date} ${d.resolved}`).join(', ')}`}>
      {daily.map(d => (
        <View key={d.date} style={styles.barCol}>
          <Text style={[styles.barValue, { color: t.text2 }]}>{d.resolved}</Text>
          <View style={[styles.bar, { height: 4 + (d.resolved / max) * 96, backgroundColor: t.primary }]} />
          <Text style={[styles.barLabel, { color: t.text3 }]}>{d.date.slice(8, 10)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PerformanceScreen() {
  const t = useTheme();
  const [range, setRange] = useState<Range>('7d');
  const perf = useMyPerformance(range);
  const p = perf.data;
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      refreshControl={<RefreshControl refreshing={perf.isRefetching} onRefresh={() => void perf.refetch()} colors={[t.primary]} tintColor={t.primary} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RANGES.map(r => (
          <Chip key={r.range} label={r.label} active={range === r.range} onPress={() => setRange(r.range)} />
        ))}
      </ScrollView>
      {perf.isPending ? (
        <Loading />
      ) : !p ? (
        <ErrorView error={perf.error} onRetry={() => void perf.refetch()} />
      ) : (
        <>
          <View style={[styles.target, { backgroundColor: t.card2 }]}>
            <Text style={[styles.targetValue, { color: t.primary }]}>{Math.round(p.targetPercent)}%</Text>
            <Text style={[styles.targetText, { color: t.text2 }]}>
              of your target · {p.resolved} of {p.resolvedTarget} resolved
            </Text>
            <View style={[styles.track, { backgroundColor: t.rule }]}>
              <View style={[styles.fill, { width: `${Math.min(100, p.targetPercent)}%`, backgroundColor: t.primary }]} />
            </View>
          </View>
          <StatGrid
            stats={[
              { label: 'Chats handled', value: String(p.chatsHandled) },
              { label: 'Resolved', value: String(p.resolved), tone: 'ok' },
              { label: 'First reply', value: replySeconds(p.avgFirstReplySeconds) },
              { label: 'Calls answered', value: String(p.callsAnswered) },
              { label: 'Calls missed', value: String(p.callsMissed), tone: p.callsMissed ? 'bad' : undefined },
              { label: 'Breaks', value: minutesLabel(p.breakMinutes) }
            ]}
          />
          {p.daily.length > 1 ? (
            <>
              <SectionTitle>Resolved per day</SectionTitle>
              <DailyBars daily={p.daily} />
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 12, paddingVertical: 10 },
  target: { margin: 12, padding: 16, borderRadius: 12 },
  targetValue: { fontSize: 34, fontWeight: '800' },
  targetText: { fontSize: 14, marginTop: 2 },
  track: { height: 8, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 24, gap: 4, minHeight: 140 },
  barCol: { flex: 1, alignItems: 'center' },
  barValue: { fontSize: 10, marginBottom: 2 },
  bar: { width: '70%', borderRadius: 3 },
  barLabel: { fontSize: 10, marginTop: 4 }
});
