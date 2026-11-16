import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, useTheme } from './theme';

interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
}

export function Chip({ label, active, count, onPress }: Props) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? t.chipActive : t.chip }]}
    >
      <Text style={[styles.text, { color: active ? t.chipActiveText : t.text2 }]}>{label}</Text>
      {count ? (
        <View style={[styles.count, { backgroundColor: active ? t.primary : t.rule }]}>
          <Text style={[styles.countText, { color: active ? t.onPrimary : t.text2 }]}>{count > 999 ? '999+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text numberOfLines={1} style={[styles.pillText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', height: 34, paddingHorizontal: 14, borderRadius: radius.pill, marginRight: 8 },
  text: { fontSize: 14, fontWeight: '600' },
  count: { marginLeft: 6, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontWeight: '700' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, maxWidth: 140 },
  pillText: { fontSize: 11, fontWeight: '700' }
});
