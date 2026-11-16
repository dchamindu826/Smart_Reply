import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Call } from '@smart-reply/shared';
import { duration, listTime } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { useTheme } from '@/ui/theme';

const OUTCOME: Record<Call['outcome'], string> = {
  ringing: 'Ringing',
  ongoing: 'In progress',
  answered: 'Answered',
  missed: 'Missed',
  rejected: 'Declined',
  forwarded: 'Forwarded',
  transferred: 'Transferred',
  failed: 'Failed'
};

interface Props {
  call: Call;
  onOpen: (c: Call) => void;
  onCall: (c: Call) => void;
}

export const CallRow = memo(function CallRow({ call: c, onOpen, onCall }: Props) {
  const t = useTheme();
  const bad = c.outcome === 'missed' || c.outcome === 'rejected' || c.outcome === 'failed';
  const icon = c.direction === 'in' ? 'arrow-down' : 'arrow-up';
  const detail = [
    OUTCOME[c.outcome],
    c.durationSeconds ? duration(c.durationSeconds) : null,
    c.handledBy ? c.handledBy.name : null
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.direction === 'in' ? 'Incoming' : 'Outgoing'} call, ${c.contact.name}, ${detail}, ${listTime(c.startedAt)}`}
        onPress={() => onOpen(c)}
        style={styles.main}
        android_ripple={{ color: t.rule }}
      >
        <Avatar initials={c.contact.initials} color={c.contact.avatarColor} size={44} />
        <View style={[styles.texts, { borderBottomColor: t.rule }]}>
          <Text numberOfLines={1} style={[styles.name, { color: bad ? t.bad : t.text }]}>
            {c.contact.name}
          </Text>
          <View style={styles.line}>
            <Ionicons name={icon} size={14} color={bad ? t.bad : t.ok} style={{ transform: [{ rotate: '45deg' }] }} />
            <Text numberOfLines={1} style={[styles.detail, { color: t.text2 }]}>
              {detail}
            </Text>
          </View>
        </View>
      </Pressable>
      <Text style={[styles.time, { color: t.text3 }]}>{listTime(c.startedAt)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Call ${c.contact.name}`} onPress={() => onCall(c)} hitSlop={8} style={styles.callBtn}>
        <Ionicons name="call-outline" size={22} color={t.primary} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  texts: { flex: 1, marginLeft: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 16, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  detail: { fontSize: 13, flex: 1 },
  time: { fontSize: 12, marginHorizontal: 6 },
  callBtn: { padding: 8 }
});
