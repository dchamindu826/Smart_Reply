import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
}

/** A settings-style list row. */
export function Row({ title, subtitle, icon, iconColor, right, onPress, danger, chevron = !!onPress }: Props) {
  const t = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={22} color={danger ? t.bad : (iconColor ?? t.text2)} style={styles.icon} /> : null}
      <View style={styles.texts}>
        <Text style={[styles.title, { color: danger ? t.bad : t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: t.text2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={t.text3} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      android_ripple={{ color: t.rule }}
    >
      {body}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: t.primary }]}>
      {children}
    </Text>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={[styles.divider, { backgroundColor: t.rule }]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  icon: { marginRight: 16, width: 24 },
  texts: { flex: 1 },
  title: { fontSize: 16 },
  subtitle: { fontSize: 13, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, textTransform: 'uppercase' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 }
});
