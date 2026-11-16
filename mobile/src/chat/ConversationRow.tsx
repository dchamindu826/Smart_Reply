import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Conversation } from '@smart-reply/shared';
import { listTime, windowState } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { Pill } from '@/ui/Chip';
import { useTheme } from '@/ui/theme';

interface Props {
  conversation: Conversation;
  now: number;
  /** Owner's name, shown to managers. `null` = team queue; `undefined` = hide. */
  ownerName?: string | null;
  onPress: (c: Conversation) => void;
}

export const ConversationRow = memo(function ConversationRow({ conversation: c, now, ownerName, onPress }: Props) {
  const t = useTheme();
  const win = windowState(c.windowExpiresAt, now);
  const unread = c.unreadCount > 0;
  const label = [
    c.contact.name,
    unread ? `${c.unreadCount} unread` : null,
    c.lastPreview,
    win.closingSoon ? `window closes in ${win.label}` : null
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(c)}
      android_ripple={{ color: t.rule }}
      style={styles.row}
    >
      <Avatar initials={c.contact.initials} color={c.contact.avatarColor} />
      <View style={[styles.main, { borderBottomColor: t.rule }]}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
            {c.contact.name}
          </Text>
          <Text style={[styles.time, { color: unread ? t.primary : t.text3, fontWeight: unread ? '700' : '400' }]}>
            {listTime(c.lastMessageAt, new Date(now))}
          </Text>
        </View>
        <View style={styles.line}>
          <View style={styles.previewWrap}>
            {c.botActive ? <Ionicons name="hardware-chip-outline" size={14} color={t.info} style={styles.icon} /> : null}
            {c.favorite ? <Ionicons name="star" size={13} color={t.warn} style={styles.icon} /> : null}
            <Text numberOfLines={1} style={[styles.preview, { color: unread ? t.text : t.text2 }]}>
              {c.lastPreview}
            </Text>
          </View>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: t.primary }]}>
              <Text style={[styles.badgeText, { color: t.onPrimary }]}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</Text>
            </View>
          ) : null}
        </View>
        {win.closingSoon || ownerName !== undefined || c.status === 'resolved' ? (
          <View style={styles.tags}>
            {win.closingSoon ? <Pill label={`⏱ ${win.label}`} color={t.warn} bg={t.warnBg} /> : null}
            {c.status === 'resolved' ? <Pill label="Resolved" color={t.ok} bg={t.chip} /> : null}
            {ownerName !== undefined ? (
              <Pill label={ownerName ?? 'Team queue'} color={ownerName ? t.text2 : t.info} bg={t.chip} />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  main: { flex: 1, marginLeft: 12, paddingVertical: 12, paddingRight: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 8 },
  time: { fontSize: 12 },
  previewWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginTop: 3, marginRight: 8 },
  icon: { marginRight: 4 },
  preview: { flex: 1, fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 }
});
