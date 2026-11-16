import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme';

/** Replaces the composer when the 24-hour window is closed: only templates reach the customer. */
export function WindowClosedBar({ onTemplate, onNote, canSend }: { onTemplate: () => void; onNote: () => void; canSend: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: t.card, borderTopColor: t.rule }]}>
      <View style={styles.line}>
        <Ionicons name="time-outline" size={18} color={t.warn} />
        <Text style={[styles.text, { color: t.text2 }]}>
          The customer has not written in 24 hours. Send an approved template to open the chat again.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          title="Send template"
          onPress={onTemplate}
          disabled={!canSend}
          style={styles.flex}
          accessibilityHint={canSend ? undefined : 'You do not have permission to send templates'}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Write an internal note" onPress={onNote} style={[styles.note, { backgroundColor: t.bubbleNote }]}>
          <Ionicons name="lock-closed" size={20} color={t.bubbleNoteText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  note: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});
