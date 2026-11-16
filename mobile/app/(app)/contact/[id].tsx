import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Contact } from '@smart-reply/shared';
import { useCalls } from '@/calls/CallProvider';
import { CALLS_NEED_DEV_BUILD, callingAvailable } from '@/calls/webrtc';
import { OwnerPicker } from '@/contacts/OwnerPicker';
import { useContact, useOwnerHistory, useRequestCallPermission, useSetBlocked, useSetOwner } from '@/features/contacts/hooks';
import { useOpenContactChat } from '@/features/conversations/hooks';
import { useMe } from '@/features/me/hooks';
import { useStaff } from '@/features/team/hooks';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/Chip';
import { Divider, Row, SectionTitle } from '@/ui/Row';
import { ErrorView, Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Action({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, { backgroundColor: t.card2, opacity: disabled ? 0.5 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={t.primary} />
      <Text style={[styles.actionLabel, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const PERMISSION_TEXT: Record<Contact['callPermission']['status'], string> = {
  none: 'Not asked yet',
  requested: 'Asked, waiting for the customer',
  temporary: 'Allowed for now',
  permanent: 'Always allowed'
};

export default function ContactScreen() {
  const { id, conversationId } = useLocalSearchParams<{ id: string; conversationId?: string }>();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const me = useMe().data;
  const contact = useContact(id);
  const history = useOwnerHistory(id);
  const staff = useStaff();
  const setOwner = useSetOwner(id);
  const setBlocked = useSetBlocked(id);
  const askPermission = useRequestCallPermission();
  const openChat = useOpenContactChat();
  const calls = useCalls();
  const [ownerOpen, setOwnerOpen] = useState(false);

  if (contact.isPending) return <Loading />;
  const c = contact.data;
  if (!c) return <ErrorView error={contact.error} onRetry={() => void contact.refetch()} />;

  const manager = me?.user.role === 'manager';
  const myId = me?.user.id ?? null;
  const ownerName = c.ownerUserId ? (staff.data?.find(s => s.id === c.ownerUserId)?.name ?? 'A team member') : null;
  const mine = c.ownerUserId !== null && c.ownerUserId === myId;

  const changeOwner = (ownerUserId: string | null) => {
    setOwnerOpen(false);
    setOwner.mutate(
      { ownerUserId, reason: '' },
      {
        onSuccess: () => toast(ownerUserId === myId ? 'You now own this customer' : ownerUserId ? 'Owner changed' : 'Moved to the team queue', 'success'),
        onError: e => toast(errorMessage(e), 'error')
      }
    );
  };

  const goChat = () => {
    if (conversationId) {
      router.back();
      return;
    }
    openChat.mutate(c.id, {
      onSuccess: conv => router.push({ pathname: '/chat/[id]', params: { id: conv.id } }),
      onError: e => toast(errorMessage(e), 'error')
    });
  };

  const call = () => {
    if (!me?.features.calling) return Alert.alert('Calling is not enabled', 'WhatsApp calling is not turned on for your company.');
    if (!callingAvailable()) return Alert.alert('Calls need the full app', CALLS_NEED_DEV_BUILD);
    void calls.startCall({ contactId: c.id, name: c.name, initials: c.initials, phone: c.phone, avatarColor: c.avatarColor });
  };

  const toggleBlock = () => {
    const next = !c.blocked;
    Alert.alert(next ? `Block ${c.name}?` : `Unblock ${c.name}?`, next ? 'They will not be able to message or call your business.' : undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: next ? 'Block' : 'Unblock',
        style: next ? 'destructive' : 'default',
        onPress: () => setBlocked.mutate(next, { onError: e => toast(errorMessage(e), 'error') })
      }
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      refreshControl={
        <RefreshControl
          refreshing={contact.isRefetching}
          onRefresh={() => {
            void contact.refetch();
            void history.refetch();
          }}
          colors={[t.primary]}
          tintColor={t.primary}
        />
      }
    >
      <View style={styles.head}>
        <Avatar initials={c.initials} color={c.avatarColor} size={88} />
        <Text accessibilityRole="header" style={[styles.name, { color: t.text }]}>
          {c.name}
        </Text>
        <Text style={[styles.phone, { color: t.text2 }]}>{c.phone || (c.username ? `@${c.username}` : 'No phone number')}</Text>
        {c.city ? <Text style={[styles.city, { color: t.text3 }]}>{c.city}</Text> : null}
        {c.blocked ? <Pill label="Blocked" color={t.bad} bg={t.badBg} /> : null}
      </View>

      <View style={styles.actions}>
        <Action icon="chatbubble-outline" label="Message" onPress={goChat} disabled={openChat.isPending} />
        <Action icon="call-outline" label="Call" onPress={call} />
        <Action
          icon="document-text-outline"
          label="Template"
          onPress={() =>
            conversationId
              ? router.push({ pathname: '/template', params: { conversationId } })
              : router.push({ pathname: '/template', params: { contactId: c.id } })
          }
        />
      </View>

      {c.labels.length ? (
        <View style={styles.labels}>
          {c.labels.map(l => (
            <Pill key={l.id} label={l.name} color={t.chipActiveText} bg={t.chipActive} />
          ))}
        </View>
      ) : null}

      <SectionTitle>Owner</SectionTitle>
      <Row icon="person-outline" title={ownerName ?? 'Team queue'} subtitle={ownerName ? 'Owns this customer' : 'No owner yet'} />
      {!c.ownerUserId && !manager ? (
        <View style={styles.pad}>
          <Button title="Take from team queue" onPress={() => myId && changeOwner(myId)} loading={setOwner.isPending} />
        </View>
      ) : null}
      {manager || mine ? (
        <>
          <Divider />
          <Row icon="swap-horizontal" title="Change owner" onPress={() => setOwnerOpen(true)} />
        </>
      ) : null}
      {mine && !manager ? (
        <>
          <Divider />
          <Row icon="exit-outline" title="Release to team queue" onPress={() => changeOwner(null)} chevron={false} />
        </>
      ) : null}

      <SectionTitle>Calls</SectionTitle>
      <Row icon="shield-checkmark-outline" title="Call permission" subtitle={PERMISSION_TEXT[c.callPermission.status]} />
      {c.callPermission.status === 'none' ? (
        <>
          <Divider />
          <Row
            icon="paper-plane-outline"
            title="Ask permission to call"
            onPress={() =>
              askPermission.mutate(c.id, {
                onSuccess: () => toast('Permission request sent', 'success'),
                onError: e => toast(errorMessage(e), 'error')
              })
            }
            chevron={false}
          />
        </>
      ) : null}
      <Divider />
      <Row icon="calendar-outline" title="Schedule a call" onPress={() => router.push({ pathname: '/schedule-call', params: { contactId: c.id, contactName: c.name } })} />

      {c.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Text style={[styles.notes, { color: t.text }]}>{c.notes}</Text>
        </>
      ) : null}

      <SectionTitle>Owner history</SectionTitle>
      {history.isPending ? (
        <Loading />
      ) : (history.data ?? []).length === 0 ? (
        <Text style={[styles.muted, { color: t.text3 }]}>No changes yet.</Text>
      ) : (
        (history.data ?? []).map(h => (
          <View key={h.id} style={[styles.history, { borderBottomColor: t.rule }]}>
            <Text style={[styles.historyMain, { color: t.text }]}>
              {(h.fromName ?? 'Team queue') + ' → ' + (h.toName ?? 'Team queue')}
            </Text>
            <Text style={[styles.historySub, { color: t.text2 }]}>
              {dateTime(h.at)} · {h.actorKind === 'user' ? h.actorName : h.actorKind.replace('_', ' ')}
              {h.reason ? ` · ${h.reason}` : ''}
            </Text>
          </View>
        ))
      )}

      <SectionTitle>Customer</SectionTitle>
      <Row icon="time-outline" title="First message" subtitle={dateTime(c.firstSeenAt)} />
      <Divider />
      <Row icon={c.blocked ? 'lock-open-outline' : 'ban-outline'} title={c.blocked ? 'Unblock' : 'Block'} danger={!c.blocked} onPress={toggleBlock} chevron={false} />
      <View style={styles.bottom} />

      <OwnerPicker visible={ownerOpen} staff={staff.data} currentOwnerId={c.ownerUserId} onClose={() => setOwnerOpen(false)} onPick={changeOwner} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 16, gap: 4 },
  name: { fontSize: 22, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  phone: { fontSize: 15 },
  city: { fontSize: 13, marginBottom: 4 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 18 },
  action: { width: 96, paddingVertical: 12, borderRadius: 12, alignItems: 'center', gap: 6 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 },
  pad: { paddingHorizontal: 16, paddingBottom: 8 },
  notes: { paddingHorizontal: 16, fontSize: 15, lineHeight: 21 },
  muted: { paddingHorizontal: 16, fontSize: 14 },
  history: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  historyMain: { fontSize: 15 },
  historySub: { fontSize: 12, marginTop: 2 },
  bottom: { height: 40 }
});
