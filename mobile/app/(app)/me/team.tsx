import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { StaffMember } from '@smart-reply/shared';
import { useStaff } from '@/features/team/hooks';
import { useNow } from '@/lib/useNow';
import { presenceText, statusColor } from '@/me/presence';
import { Avatar } from '@/ui/Avatar';
import { EmptyView, ErrorView, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

function StaffRow({ s, now }: { s: StaffMember; now: number }) {
  const t = useTheme();
  const call = presenceText(s.presence.call, now);
  const chat = presenceText(s.presence.chat, now);
  return (
    <View accessible accessibilityLabel={`${s.name}. Calls: ${call}. Chats: ${chat}. ${s.stats.openChats} open chats.`} style={[styles.row, { borderBottomColor: t.rule }]}>
      <Avatar initials={s.initials} color={s.avatarColor} size={44} />
      <View style={styles.texts}>
        <Text style={[styles.name, { color: t.text }]}>
          {s.name}
          {s.status !== 'active' ? <Text style={{ color: t.text3 }}> · {s.status}</Text> : null}
        </Text>
        <View style={styles.line}>
          <View style={[styles.dot, { backgroundColor: statusColor(s.presence.call.status, t) }]} />
          <Text numberOfLines={1} style={[styles.status, { color: t.text2 }]}>
            Calls: {call}
          </Text>
        </View>
        <View style={styles.line}>
          <View style={[styles.dot, { backgroundColor: statusColor(s.presence.chat.status, t) }]} />
          <Text numberOfLines={1} style={[styles.status, { color: t.text2 }]}>
            Chats: {chat}
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.stat, { color: t.text }]}>{s.stats.openChats}</Text>
        <Text style={[styles.statLabel, { color: t.text3 }]}>open</Text>
      </View>
    </View>
  );
}

/** Managers: who is available, on a call or on a break. Kept live by `presence.updated`. */
export default function TeamScreen() {
  const t = useTheme();
  const now = useNow(30_000);
  const staff = useStaff();
  if (staff.isPending) return <Loading />;
  if (staff.isError) return <ErrorView error={staff.error} onRetry={() => void staff.refetch()} />;
  const items = [...staff.data].filter(s => s.status !== 'disabled').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={items}
      keyExtractor={s => s.id}
      renderItem={({ item }) => <StaffRow s={item} now={now} />}
      refreshControl={<RefreshControl refreshing={staff.isRefetching} onRefresh={() => void staff.refetch()} colors={[t.primary]} tintColor={t.primary} />}
      ListEmptyComponent={<EmptyView icon="people-outline" title="No team members yet" />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, marginLeft: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { fontSize: 13, flex: 1 },
  stats: { alignItems: 'center', marginLeft: 8 },
  stat: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11 }
});
