import { StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from '@/ui/theme';

export interface Stat {
  label: string;
  value: string;
  tone?: 'bad' | 'warn' | 'ok';
}

export function StatGrid({ stats }: { stats: Stat[] }) {
  const t = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map(s => (
        <View key={s.label} accessible accessibilityLabel={`${s.label}: ${s.value}`} style={[styles.cell, { backgroundColor: t.card2 }]}>
          <Text style={[styles.value, { color: s.tone ? t[s.tone] : t.text }]}>{s.value}</Text>
          <Text style={[styles.label, { color: t.text2 }]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  cell: { flexBasis: '31%', flexGrow: 1, borderRadius: radius.md, padding: 12 },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 12, marginTop: 2 }
});
