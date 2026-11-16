import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { duration } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { Sheet } from '@/ui/Sheet';
import { Row } from '@/ui/Row';
import { brand, useTheme } from '@/ui/theme';
import { useCalls } from './CallProvider';
import { CALLS_NEED_DEV_BUILD, callingAvailable } from './webrtc';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DECLINE_MESSAGES = [
  "Sorry, I can't talk right now. I'll call you back soon.",
  "I'm on another call. I'll call you back in a few minutes.",
  'Please send me a message here and I will reply.'
];

function RoundButton({ icon, label, color, onPress, active, disabled }: {
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={styles.action}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.round, { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
      >
        <Ionicons name={icon} size={30} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.status}>{duration((now - since) / 1000)}</Text>;
}

/** Full-screen incoming, outgoing and in-call UI. Rendered above everything by CallProvider. */
export function CallOverlay() {
  const t = useTheme();
  const { state, answer, decline, hangup, toggleMute, toggleSpeaker, speakerAvailable } = useCalls();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const visible = state.phase !== 'idle';
  const peer = state.peer;
  const canAnswer = callingAvailable() && !!state.sdpOffer;

  useEffect(() => {
    if (state.phase !== 'incoming') setDeclineOpen(false);
  }, [state.phase]);

  let status = '';
  if (state.phase === 'incoming') status = 'Incoming WhatsApp call';
  else if (state.phase === 'dialing') status = state.call ? 'Ringing…' : 'Calling…';
  else if (state.phase === 'connecting') status = 'Connecting…';
  else if (state.phase === 'ended') status = state.message ?? 'Call ended';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => undefined} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={[styles.screen, { backgroundColor: brand.dark }]}>
        <View style={styles.top}>
          {peer ? <Avatar initials={peer.initials} color={peer.avatarColor} size={112} /> : null}
          <Text accessibilityRole="header" style={styles.name}>
            {peer?.name ?? ''}
          </Text>
          {peer?.phone ? <Text style={styles.phone}>{peer.phone}</Text> : null}
          {state.phase === 'active' && state.connectedAt ? (
            <Timer since={state.connectedAt} />
          ) : (
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              {status}
            </Text>
          )}
          {state.call?.ivrOption ? <Text style={styles.phone}>Chose: {state.call.ivrOption}</Text> : null}
          {state.phase === 'incoming' && !callingAvailable() ? <Text style={styles.note}>{CALLS_NEED_DEV_BUILD}</Text> : null}
          {state.phase === 'incoming' && callingAvailable() && !state.sdpOffer ? (
            <Text style={styles.note}>This call cannot be answered on the phone. Answer it in the web app.</Text>
          ) : null}
        </View>

        {state.phase === 'incoming' ? (
          <View style={styles.row}>
            <RoundButton icon="close" label="Decline" color="#D93025" onPress={() => void decline()} />
            <RoundButton icon="chatbubble-ellipses" label="Message" color="#3C4A44" onPress={() => setDeclineOpen(true)} />
            <RoundButton icon="call" label="Answer" color={brand.primary} onPress={() => void answer()} disabled={!canAnswer} />
          </View>
        ) : null}

        {state.phase === 'dialing' || state.phase === 'connecting' || state.phase === 'active' ? (
          <View style={styles.row}>
            <RoundButton
              icon={state.muted ? 'mic-off' : 'mic'}
              label={state.muted ? 'Unmute' : 'Mute'}
              color={state.muted ? '#5F6B66' : '#3C4A44'}
              active={state.muted}
              onPress={toggleMute}
            />
            <RoundButton icon="call" label="Hang up" color="#D93025" onPress={() => void hangup()} />
            <RoundButton
              icon={state.speaker ? 'volume-high' : 'volume-medium'}
              label="Speaker"
              color={state.speaker ? '#5F6B66' : '#3C4A44'}
              active={state.speaker}
              disabled={!speakerAvailable}
              onPress={toggleSpeaker}
            />
          </View>
        ) : null}
      </SafeAreaView>

      <Sheet visible={declineOpen} title="Decline with a message" onClose={() => setDeclineOpen(false)}>
        {DECLINE_MESSAGES.map(m => (
          <Row key={m} title={m} icon="chatbubble-outline" onPress={() => void decline(m)} chevron={false} />
        ))}
        <View style={styles.customRow}>
          <TextInput
            accessibilityLabel="Your own message"
            placeholder="Write your own…"
            placeholderTextColor={t.text3}
            value={custom}
            onChangeText={setCustom}
            style={[styles.customInput, { color: t.text, backgroundColor: t.card2 }]}
            maxLength={1024}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decline and send"
            disabled={!custom.trim()}
            onPress={() => void decline(custom.trim())}
            style={[styles.send, { backgroundColor: t.primary, opacity: custom.trim() ? 1 : 0.5 }]}
          >
            <Ionicons name="send" size={18} color={t.onPrimary} />
          </Pressable>
        </View>
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'space-between' },
  top: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  name: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  phone: { color: '#BFD8CB', fontSize: 16, marginTop: 6 },
  status: { color: '#E3F2EA', fontSize: 17, marginTop: 14 },
  note: { color: '#FFE7A8', fontSize: 14, marginTop: 18, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: 56 },
  action: { alignItems: 'center', width: 96 },
  round: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#FFFFFF', marginTop: 8, fontSize: 13 },
  customRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  customInput: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }
});
