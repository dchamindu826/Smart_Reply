import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { ScheduledCall } from '@smart-reply/shared';
import { useDeleteScheduledCall, useScheduledCalls } from '@/features/calls/hooks';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/time';
import { Button } from '@/ui/Button';
import { EmptyView, ErrorView, Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

function Item({ s, onDelete, onOpen }: { s: ScheduledCall; onDelete: () => void; onOpen: () => void }) {
  const t = useTheme();
  const overdue = s.status === 'pending' && Date.parse(s.scheduledAt) < Date.now();
  return (
    <View style={[styles.item, { borderBottomColor: t.rule }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${s.contactName}, ${dateTime(s.scheduledAt)}. Open customer`} onPress={onOpen} style={styles.flex}>
        <Text style={[styles.name, { color: t.text }]}>{s.contactName}</Text>
        <Text style={[styles.when, { color: overdue ? t.bad : t.text2 }]}>
          {dateTime(s.scheduledAt)}
          {s.status !== 'pending' ? ` · ${s.status}` : overdue ? ' · overdue' : ''} · {s.userName}
        </Text>
        {s.note ? <Text style={[styles.note, { color: t.text2 }]}>{s.note}</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete scheduled call with ${s.contactName}`} onPress={onDelete} hitSlop={8} style={styles.del}>
        <Ionicons name="trash-outline" size={20} color={t.bad} />
      </Pressable>
    </View>
  );
}

export function ScheduledList() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const list = useScheduledCalls();
  const del = useDeleteScheduledCall();
  const items = [...(list.data ?? [])].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

  const confirmDelete = (s: ScheduledCall) =>
    Alert.alert('Delete scheduled call?', `${s.contactName}, ${dateTime(s.scheduledAt)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(s.id, { onError: e => toast(errorMessage(e), 'error') }) }
    ]);

  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorView error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <View style={styles.flex}>
      <FlatList
        data={items}
        keyExtractor={s => s.id}
        renderItem={({ item }) => (
          <Item s={item} onDelete={() => confirmDelete(item)} onOpen={() => router.push({ pathname: '/contact/[id]', params: { id: item.contactId } })} />
        )}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} colors={[t.primary]} tintColor={t.primary} />}
        ListEmptyComponent={<EmptyView icon="calendar-outline" title="No scheduled calls" text="Plan a call back so you do not forget it." />}
        contentContainerStyle={items.length === 0 ? styles.grow : undefined}
      />
      <View style={[styles.footer, { borderTopColor: t.rule }]}>
        <Button title="Schedule a call" onPress={() => router.push('/schedule-call')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 16, fontWeight: '600' },
  when: { fontSize: 13, marginTop: 2 },
  note: { fontSize: 13, marginTop: 4 },
  del: { padding: 8 },
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth }
});
