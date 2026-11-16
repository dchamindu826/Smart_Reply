import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PresenceStatus } from '@smart-reply/shared';
import { useSetPresence } from '@/features/me/hooks';
import { errorMessage } from '@/lib/errors';
import { useNow } from '@/lib/useNow';
import { BREAK_REASONS, PLANNED_MINUTES, STATUS_LABEL, presenceText, statusColor } from '@/me/presence';
import { useMyPresence } from '@/me/useMyPresence';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Field } from '@/ui/Field';
import { Row, SectionTitle } from '@/ui/Row';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

type Channel = 'both' | 'call' | 'chat';
const SETTABLE: Exclude<PresenceStatus, 'oncall'>[] = ['available', 'brk', 'away', 'dnd'];

export default function StatusScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(30_000);
  const { me } = useMyPresence();
  const setPresence = useSetPresence();
  const [channel, setChannel] = useState<Channel>('both');
  const [status, setStatus] = useState<Exclude<PresenceStatus, 'oncall'>>('available');
  const [reason, setReason] = useState<string>('Tea');
  const [other, setOther] = useState('');
  const [minutes, setMinutes] = useState<number>(15);

  const save = () => {
    const why = status === 'brk' ? (reason === 'Other' ? other.trim() || 'Other' : reason) : status === 'away' || status === 'dnd' ? other.trim() : '';
    setPresence.mutate(
      { channel, status, reason: why, plannedMinutes: status === 'brk' ? minutes : 0 },
      {
        onSuccess: () => {
          toast(`Status set to ${STATUS_LABEL[status]}`, 'success');
          router.back();
        },
        onError: e => toast(errorMessage(e), 'error')
      }
    );
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <SectionTitle>Now</SectionTitle>
      <Row icon="call" iconColor={me ? statusColor(me.presence.call.status, t) : t.text3} title="Calls" subtitle={me ? presenceText(me.presence.call, now) : '…'} />
      <Row icon="chatbubbles" iconColor={me ? statusColor(me.presence.chat.status, t) : t.text3} title="Chats" subtitle={me ? presenceText(me.presence.chat, now) : '…'} />

      <SectionTitle>Change status for</SectionTitle>
      <View style={styles.chips}>
        <Chip label="Calls and chats" active={channel === 'both'} onPress={() => setChannel('both')} />
        <Chip label="Calls" active={channel === 'call'} onPress={() => setChannel('call')} />
        <Chip label="Chats" active={channel === 'chat'} onPress={() => setChannel('chat')} />
      </View>

      <SectionTitle>Status</SectionTitle>
      {SETTABLE.map(s => (
        <Pressable
          key={s}
          accessibilityRole="radio"
          accessibilityState={{ checked: status === s }}
          accessibilityLabel={STATUS_LABEL[s]}
          onPress={() => setStatus(s)}
          style={styles.option}
        >
          <View style={[styles.dot, { backgroundColor: statusColor(s, t) }]} />
          <Text style={[styles.optionText, { color: t.text }]}>{STATUS_LABEL[s]}</Text>
          <Ionicons name={status === s ? 'radio-button-on' : 'radio-button-off'} size={22} color={status === s ? t.primary : t.text3} />
        </Pressable>
      ))}

      {status === 'brk' ? (
        <>
          <SectionTitle>Reason</SectionTitle>
          <View style={styles.chips}>
            {BREAK_REASONS.map(r => (
              <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          {reason === 'Other' ? (
            <View style={styles.pad}>
              <Field label="Reason" value={other} onChangeText={setOther} maxLength={60} />
            </View>
          ) : null}
          <SectionTitle>Planned length</SectionTitle>
          <View style={styles.chips}>
            {PLANNED_MINUTES.map(m => (
              <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
            ))}
          </View>
        </>
      ) : status === 'away' || status === 'dnd' ? (
        <View style={styles.pad}>
          <Field label="Note (optional)" value={other} onChangeText={setOther} maxLength={60} />
        </View>
      ) : null}

      <View style={styles.pad}>
        <Button title="Save status" onPress={save} loading={setPresence.isPending} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, rowGap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
  optionText: { flex: 1, fontSize: 16 },
  pad: { paddingHorizontal: 16, paddingTop: 16 }
});
