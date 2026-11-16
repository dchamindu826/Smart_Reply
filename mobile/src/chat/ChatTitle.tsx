import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Conversation } from '@smart-reply/shared';
import { windowState } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { Avatar } from '@/ui/Avatar';
import { useTheme } from '@/ui/theme';

/** Header title: avatar, name and the window status. Tap opens customer info. */
export function ChatTitle({ conversation, onPress }: { conversation: Conversation; onPress: () => void }) {
  const t = useTheme();
  const now = useNow(30_000);
  const win = windowState(conversation.windowExpiresAt, now);
  const sub = conversation.botActive
    ? 'Bot is replying'
    : win.open
      ? win.closingSoon
        ? `Window closes in ${win.label.replace(' left', '')}`
        : conversation.contact.phone || 'Window open'
      : 'Window closed · template only';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${conversation.contact.name}. ${sub}. Open customer info`}
      onPress={onPress}
      style={styles.row}
    >
      <Avatar initials={conversation.contact.initials} color={conversation.contact.avatarColor} size={36} />
      <View style={styles.texts}>
        <Text numberOfLines={1} style={[styles.name, { color: t.onHeader }]}>
          {conversation.contact.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: win.closingSoon || !win.open ? '#FFD479' : '#BFD8CB' }]}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', maxWidth: 230 },
  texts: { marginLeft: 10, flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12 }
});
