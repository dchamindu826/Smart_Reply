import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { Call, CallFilter } from '@smart-reply/shared';
import { useCalls } from '@/calls/CallProvider';
import { CALLS_NEED_DEV_BUILD, callingAvailable } from '@/calls/webrtc';
import { CallRow } from '@/callsui/CallRow';
import { ScheduledList } from '@/callsui/ScheduledList';
import { useCallLog } from '@/features/calls/hooks';
import { useMe } from '@/features/me/hooks';
import { flatItems } from '@/features/paged';
import { Chip } from '@/ui/Chip';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { EmptyView, ErrorView, FooterSpinner, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

const FILTERS: { filter: CallFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'missed', label: 'Missed' },
  { filter: 'incoming', label: 'Incoming' },
  { filter: 'outgoing', label: 'Outgoing' }
];

type Tab = 'log' | 'scheduled';

export default function CallsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useMe().data;
  const calls = useCalls();
  const [tab, setTab] = useState<Tab>('log');
  const [filter, setFilter] = useState<CallFilter>('all');
  const log = useCallLog(filter);
  const items = flatItems(log.data);

  const open = useCallback((c: Call) => router.push({ pathname: '/contact/[id]', params: { id: c.contactId } }), [router]);
  const callBack = useCallback(
    (c: Call) => {
      if (!me?.features.calling) return Alert.alert('Calling is not enabled', 'WhatsApp calling is not turned on for your company.');
      if (!callingAvailable()) return Alert.alert('Calls need the full app', CALLS_NEED_DEV_BUILD);
      void calls.startCall({ contactId: c.contactId, ...c.contact });
    },
    [calls, me]
  );

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <OfflineBanner />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Call log" active={tab === 'log'} onPress={() => setTab('log')} />
          <Chip label="Scheduled" active={tab === 'scheduled'} onPress={() => setTab('scheduled')} />
          {tab === 'log' ? <View style={[styles.sep, { backgroundColor: t.rule }]} /> : null}
          {tab === 'log'
            ? FILTERS.map(f => <Chip key={f.filter} label={f.label} active={filter === f.filter} onPress={() => setFilter(f.filter)} />)
            : null}
        </ScrollView>
      </View>
      {tab === 'scheduled' ? (
        <ScheduledList />
      ) : log.isPending ? (
        <Loading />
      ) : log.isError && items.length === 0 ? (
        <ErrorView error={log.error} onRetry={() => void log.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          renderItem={({ item }) => <CallRow call={item} onOpen={open} onCall={callBack} />}
          onEndReached={() => {
            if (log.hasNextPage && !log.isFetchingNextPage) void log.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={log.isRefetching && !log.isFetchingNextPage} onRefresh={() => void log.refetch()} colors={[t.primary]} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyView icon="call-outline" title="No calls" text="WhatsApp calls with customers appear here." />}
          ListFooterComponent={log.isFetchingNextPage ? <FooterSpinner /> : null}
          contentContainerStyle={items.length === 0 ? styles.grow : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chips: { paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  sep: { width: 1, height: 22, marginRight: 8 },
  grow: { flexGrow: 1 }
});
