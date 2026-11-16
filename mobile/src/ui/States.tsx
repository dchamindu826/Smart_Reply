import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';
import { useTheme } from './theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Loading({ label = 'Loading' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={t.text3} />
      <Text accessibilityRole="alert" style={[styles.title, { color: t.text }]}>
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} style={styles.btn} /> : null}
    </View>
  );
}

export function EmptyView({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={t.text3} />
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {text ? <Text style={[styles.text, { color: t.text2 }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 240 },
  title: { fontSize: 16, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  text: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  btn: { marginTop: 16 }
});

export function FooterSpinner() {
  const t = useTheme();
  return <ActivityIndicator style={{ margin: 16 }} color={t.primary} accessibilityLabel="Loading more" />;
}
