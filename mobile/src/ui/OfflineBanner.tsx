import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useSocket } from '@/realtime/SocketProvider';
import { useTheme } from './theme';

/** Shown while the live connection is down: messages may be late until it returns. */
export function OfflineBanner() {
  const t = useTheme();
  const { connected, settled } = useSocket();
  if (connected || !settled) return null;
  return (
    <View accessibilityRole="alert" style={[styles.bar, { backgroundColor: t.warnBg }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={t.warn} />
      <Text style={[styles.text, { color: t.warn }]}>Connecting… new messages may be delayed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  text: { fontSize: 13, fontWeight: '600' }
});
