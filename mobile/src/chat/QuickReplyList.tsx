import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { QuickReply } from '@smart-reply/shared';
import { useTheme } from '@/ui/theme';

interface Props {
  items: QuickReply[];
  loading: boolean;
  onPick: (qr: QuickReply) => void;
}

/** The list that opens above the composer when the message starts with `/`. */
export function QuickReplyList({ items, loading, onPick }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: t.card, borderColor: t.rule }]}>
      <FlatList
        keyboardShouldPersistTaps="always"
        data={items}
        keyExtractor={q => q.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quick reply ${item.command}, ${item.title}`}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.card2 }]}
          >
            <Text style={[styles.cmd, { color: t.primary }]}>{item.command}</Text>
            <View style={styles.texts}>
              <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
                {item.title}
                {item.attachments.length ? `  📎${item.attachments.length}` : ''}
              </Text>
              <Text numberOfLines={1} style={[styles.text, { color: t.text2 }]}>
                {item.text}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: t.text3 }]}>{loading ? 'Loading quick replies…' : 'No quick reply matches.'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { maxHeight: 240, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  cmd: { fontWeight: '700', fontSize: 14, width: 90 },
  texts: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600' },
  text: { fontSize: 13 },
  empty: { padding: 16, textAlign: 'center' }
});
