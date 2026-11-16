import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { Conversation, ConversationCounts, ConversationFilter } from '@smart-reply/shared';
import { ConversationRow } from '@/chat/ConversationRow';
import { useConversationList, useCounts } from '@/features/conversations/hooks';
import { useIsManager } from '@/features/me/hooks';
import { flatItems } from '@/features/paged';
import { useStaffNames } from '@/features/team/hooks';
import { useDebounced, useNow } from '@/lib/useNow';
import { Chip } from '@/ui/Chip';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyView, ErrorView, FooterSpinner, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

const FILTERS: { filter: ConversationFilter; label: string; count?: keyof ConversationCounts }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'unread', label: 'Unread', count: 'unread' },
  { filter: 'mine', label: 'Mine', count: 'mine' },
  { filter: 'pool', label: 'Team queue', count: 'pool' },
  { filter: 'expiring', label: 'Closing soon', count: 'closingSoon' },
  { filter: 'favorites', label: 'Favourites' },
  { filter: 'archived', label: 'Archived' },
  { filter: 'resolved', label: 'Resolved' }
];

const EMPTY: Record<ConversationFilter, string> = {
  all: 'No chats yet. New WhatsApp messages appear here.',
  unread: 'You are all caught up.',
  mine: 'No chats are assigned to you.',
  pool: 'Nothing is waiting in the team queue.',
  no_owner: 'Every chat has an owner.',
  expiring: 'No chat windows are closing soon.',
  labeled: 'No labelled chats.',
  favorites: 'Star a chat to keep it here.',
  archived: 'No archived chats.',
  resolved: 'No resolved chats.'
};

export default function ChatsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const list = useConversationList(filter, q);
  const counts = useCounts();
  const manager = useIsManager();
  const owners = useStaffNames(manager);
  const now = useNow();
  const items = flatItems(list.data);

  const open = useCallback((c: Conversation) => router.push({ pathname: '/chat/[id]', params: { id: c.id } }), [router]);
  const refresh = useCallback(() => {
    void list.refetch();
    void counts.refetch();
  }, [list, counts]);

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <OfflineBanner />
      <SearchBar value={search} onChange={setSearch} placeholder="Search name, number or message" />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map(f => (
            <Chip
              key={f.filter}
              label={f.label}
              active={filter === f.filter}
              count={f.count ? counts.data?.[f.count] : undefined}
              onPress={() => setFilter(f.filter)}
            />
          ))}
        </ScrollView>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError && items.length === 0 ? (
        <ErrorView error={list.error} onRetry={refresh} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              now={now}
              onPress={open}
              ownerName={manager ? (item.contact.ownerUserId ? (owners.get(item.contact.ownerUserId) ?? 'Staff') : null) : undefined}
            />
          )}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={refresh} colors={[t.primary]} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyView icon="chatbubbles-outline" title={q ? 'No chats match your search.' : EMPTY[filter]} />}
          ListFooterComponent={list.isFetchingNextPage ? <FooterSpinner /> : null}
          contentContainerStyle={items.length === 0 ? styles.grow : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chips: { paddingHorizontal: 12, paddingVertical: 10 },
  grow: { flexGrow: 1 }
});
