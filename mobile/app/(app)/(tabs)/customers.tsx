import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Contact } from '@smart-reply/shared';
import { useContactList } from '@/features/contacts/hooks';
import { flatItems } from '@/features/paged';
import { useDebounced } from '@/lib/useNow';
import { Avatar } from '@/ui/Avatar';
import { Chip, Pill } from '@/ui/Chip';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyView, ErrorView, FooterSpinner, Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

type Owner = '' | 'me' | 'none';
const OWNERS: { owner: Owner; label: string }[] = [
  { owner: '', label: 'All' },
  { owner: 'me', label: 'Mine' },
  { owner: 'none', label: 'Team queue' }
];

const ContactRow = memo(function ContactRow({ c, onPress }: { c: Contact; onPress: (c: Contact) => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, ${c.phone}${c.city ? `, ${c.city}` : ''}`}
      onPress={() => onPress(c)}
      android_ripple={{ color: t.rule }}
      style={styles.row}
    >
      <Avatar initials={c.initials} color={c.avatarColor} size={44} />
      <View style={[styles.texts, { borderBottomColor: t.rule }]}>
        <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>
          {c.name}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: t.text2 }]}>
          {[c.phone, c.city].filter(Boolean).join(' · ')}
        </Text>
        {c.labels.length || c.blocked ? (
          <View style={styles.tags}>
            {c.blocked ? <Pill label="Blocked" color={t.bad} bg={t.badBg} /> : null}
            {c.labels.slice(0, 3).map(l => (
              <Pill key={l.id} label={l.name} color={t.chipActiveText} bg={t.chipActive} />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export default function CustomersScreen() {
  const t = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState<Owner>('');
  const q = useDebounced(search.trim(), 350);
  const list = useContactList(q, owner);
  const items = flatItems(list.data);

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search name or number" />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {OWNERS.map(o => (
            <Chip key={o.owner || 'all'} label={o.label} active={owner === o.owner} onPress={() => setOwner(o.owner)} />
          ))}
        </ScrollView>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError && items.length === 0 ? (
        <ErrorView error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          renderItem={({ item }) => <ContactRow c={item} onPress={c => router.push({ pathname: '/contact/[id]', params: { id: c.id } })} />}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} colors={[t.primary]} tintColor={t.primary} />}
          ListEmptyComponent={<EmptyView icon="people-outline" title={q ? 'No customers match your search.' : 'No customers yet'} />}
          ListFooterComponent={list.isFetchingNextPage ? <FooterSpinner /> : null}
          contentContainerStyle={items.length === 0 ? styles.grow : styles.pad}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a customer"
        onPress={() => router.push('/contact/new')}
        style={[styles.fab, { backgroundColor: t.primary }]}
      >
        <Ionicons name="person-add" size={24} color={t.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chips: { paddingHorizontal: 12, paddingVertical: 10 },
  grow: { flexGrow: 1 },
  pad: { paddingBottom: 88 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  texts: { flex: 1, marginLeft: 12, paddingVertical: 12, paddingRight: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }
});
