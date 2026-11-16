import { useRouter } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { useMe, useMyDashboard } from '@/features/me/hooks';
import { replySeconds } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { presenceText, statusColor } from '@/me/presence';
import { StatGrid } from '@/me/StatGrid';
import { useMyPresence } from '@/me/useMyPresence';
import { Avatar } from '@/ui/Avatar';
import { Divider, Row, SectionTitle } from '@/ui/Row';
import { Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

export default function MeScreen() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const me = useMe();
  const dash = useMyDashboard();
  const { me: self } = useMyPresence();
  const now = useNow(60_000);
  const user = me.data?.user;
  const manager = user?.role === 'manager';
  const d = dash.data;

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will stop getting chat and call notifications on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }
    ]);

  if (!user) return <Loading />;
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      refreshControl={
        <RefreshControl
          refreshing={dash.isRefetching}
          onRefresh={() => {
            void dash.refetch();
            void me.refetch();
          }}
          colors={[t.primary]}
          tintColor={t.primary}
        />
      }
    >
      <View style={styles.head}>
        <Avatar initials={user.initials} color={user.avatarColor} size={64} />
        <View style={styles.headText}>
          <Text accessibilityRole="header" style={[styles.name, { color: t.text }]}>
            {user.name}
          </Text>
          <Text style={[styles.sub, { color: t.text2 }]}>
            {[user.title || (manager ? 'Manager' : 'Staff'), me.data?.company?.name].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <SectionTitle>My day</SectionTitle>
      {d ? (
        <StatGrid
          stats={[
            { label: 'Open chats', value: String(d.openChats) },
            { label: 'Unread', value: String(d.unread), tone: d.unread ? 'warn' : undefined },
            { label: 'Closing soon', value: String(d.closingSoon), tone: d.closingSoon ? 'warn' : undefined },
            { label: 'Calls today', value: String(d.callsToday) },
            { label: 'Missed calls', value: String(d.callsMissed), tone: d.callsMissed ? 'bad' : undefined },
            { label: 'Resolved', value: String(d.resolvedToday), tone: 'ok' },
            { label: 'First reply', value: replySeconds(d.avgFirstReplySeconds) },
            { label: 'Target', value: `${Math.round(d.targetPercent)}%` },
            { label: 'Scheduled', value: String(d.scheduledCalls.length) }
          ]}
        />
      ) : dash.isPending ? (
        <Loading />
      ) : (
        <Text style={[styles.muted, { color: t.text3 }]}>My day is not available right now.</Text>
      )}

      <SectionTitle>Status</SectionTitle>
      <Row
        icon="call"
        iconColor={self ? statusColor(self.presence.call.status, t) : t.text3}
        title="Calls"
        subtitle={self ? presenceText(self.presence.call, now) : '…'}
        onPress={() => router.push('/me/status')}
      />
      <Divider />
      <Row
        icon="chatbubbles"
        iconColor={self ? statusColor(self.presence.chat.status, t) : t.text3}
        title="Chats"
        subtitle={self ? presenceText(self.presence.chat, now) : '…'}
        onPress={() => router.push('/me/status')}
      />
      <Divider />
      <Row icon="cafe-outline" title="My breaks" onPress={() => router.push('/me/breaks')} />
      <Divider />
      <Row icon="trending-up-outline" title="My performance" onPress={() => router.push('/me/performance')} />
      {manager ? (
        <>
          <Divider />
          <Row icon="people-outline" title="Team" subtitle="Who is available right now" onPress={() => router.push('/me/team')} />
        </>
      ) : null}

      <SectionTitle>Account</SectionTitle>
      <Row icon="person-outline" title="Profile and notifications" onPress={() => router.push('/me/profile')} />
      <Divider />
      <Row icon="key-outline" title="Change password" onPress={() => router.push('/me/password')} />
      <Divider />
      <Row icon="log-out-outline" title="Sign out" danger onPress={confirmSignOut} chevron={false} />
      <Text style={[styles.footer, { color: t.text3 }]}>Smart Reply by LUMI AI · works with the WhatsApp Business Platform</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  headText: { marginLeft: 14, flex: 1 },
  name: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 14, marginTop: 2 },
  muted: { paddingHorizontal: 16, fontSize: 14 },
  footer: { fontSize: 12, textAlign: 'center', padding: 24 }
});
