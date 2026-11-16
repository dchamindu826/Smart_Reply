import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Message, QuickReply } from '@smart-reply/shared';
import { matchQuickReplies, useQuickReplies } from '@/features/content/hooks';
import { errorMessage } from '@/lib/errors';
import { checkSendable, type LocalFile } from '@/lib/upload';
import { duration } from '@/lib/time';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme';
import { pickDocument, pickPhoto, takePhoto } from './pickers';
import { QuickReplyList } from './QuickReplyList';
import { useVoiceRecorder } from './useVoiceRecorder';

export interface ComposerSend {
  text: string;
  files: LocalFile[];
  voice?: boolean;
  durationSeconds?: number;
  note: boolean;
  replyToId?: string;
}

interface Props {
  replyTo: Message | null;
  onClearReply: () => void;
  onSend: (s: ComposerSend) => void;
  onQuickReply: (qr: QuickReply) => void;
  /** Notes can still be written when the customer window is closed. */
  notesOnly?: boolean;
}

function IconButton({ icon, label, onPress, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.iconBtn}>
      <Ionicons name={icon} size={24} color={color} />
    </Pressable>
  );
}

export function Composer({ replyTo, onClearReply, onSend, onQuickReply, notesOnly }: Props) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [noteMode, setNoteMode] = useState(!!notesOnly);
  const [attachOpen, setAttachOpen] = useState(false);
  const voice = useVoiceRecorder();
  const note = noteMode || !!notesOnly;
  const slash = !note && text.startsWith('/') && !text.includes(' ');
  const quick = useQuickReplies(slash);
  const matches = slash ? matchQuickReplies(quick.data ?? [], text) : [];

  const send = (files: LocalFile[] = [], extra: Partial<ComposerSend> = {}) => {
    const body = text.trim();
    if (!body && files.length === 0) return;
    onSend({ text: body, files, note, replyToId: replyTo?.id, ...extra });
    setText('');
    onClearReply();
  };

  const attach = async (pick: () => Promise<LocalFile | null>) => {
    setAttachOpen(false);
    try {
      const file = await pick();
      if (!file) return;
      if (file.size) checkSendable(file.mime, file.size);
      send([file]);
    } catch (err) {
      Alert.alert('Cannot attach', errorMessage(err));
    }
  };

  const startVoice = async () => {
    try {
      await voice.start();
    } catch (err) {
      Alert.alert('Cannot record', errorMessage(err));
    }
  };

  const finishVoice = async () => {
    try {
      const clip = await voice.finish();
      if (clip) onSend({ text: '', files: [clip.file], voice: true, durationSeconds: clip.seconds, note, replyToId: replyTo?.id });
      onClearReply();
    } catch (err) {
      Alert.alert('Recording failed', errorMessage(err));
    }
  };

  if (voice.active) {
    return (
      <View style={[styles.bar, { backgroundColor: t.card, borderTopColor: t.rule }]}>
        <IconButton icon="trash-outline" label="Cancel recording" color={t.bad} onPress={() => void voice.cancel()} />
        <View style={styles.recording} accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: t.bad }]} />
          <Text style={[styles.recText, { color: t.text }]}>Recording {duration(voice.durationMs / 1000)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send voice note" onPress={() => void finishVoice()} style={[styles.send, { backgroundColor: t.primary }]}>
          <Ionicons name="send" size={20} color={t.onPrimary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {slash ? (
        <QuickReplyList
          items={matches}
          loading={quick.isPending}
          onPick={qr => {
            setText('');
            onQuickReply(qr);
          }}
        />
      ) : null}
      {replyTo ? (
        <View style={[styles.reply, { backgroundColor: t.card2, borderLeftColor: t.primary }]}>
          <View style={styles.flex}>
            <Text style={[styles.replyLabel, { color: t.primary }]}>Replying to {replyTo.direction === 'in' ? 'customer' : 'message'}</Text>
            <Text numberOfLines={1} style={{ color: t.text2 }}>
              {replyTo.body || replyTo.attachments[0]?.name || 'Message'}
            </Text>
          </View>
          <IconButton icon="close" label="Cancel reply" color={t.text2} onPress={onClearReply} />
        </View>
      ) : null}
      <View style={[styles.bar, { backgroundColor: note ? t.bubbleNote : t.card, borderTopColor: t.rule }]}>
        {!notesOnly ? (
          <IconButton
            icon={note ? 'lock-closed' : 'lock-open-outline'}
            label={note ? 'Internal note on. Switch to customer message' : 'Write an internal note'}
            color={note ? t.bubbleNoteText : t.text2}
            onPress={() => setNoteMode(v => !v)}
          />
        ) : null}
        <IconButton icon="add" label="Attach photo or file" color={t.text2} onPress={() => setAttachOpen(true)} />
        <TextInput
          accessibilityLabel={note ? 'Internal note' : 'Message'}
          value={text}
          onChangeText={setText}
          placeholder={note ? 'Internal note (only your team sees it)' : 'Message  ·  type / for quick replies'}
          placeholderTextColor={note ? t.bubbleNoteText : t.text3}
          multiline
          maxLength={4096}
          style={[styles.input, { color: note ? t.bubbleNoteText : t.text, backgroundColor: note ? 'transparent' : t.card2 }]}
        />
        {text.trim() ? (
          <Pressable accessibilityRole="button" accessibilityLabel={note ? 'Save note' : 'Send'} onPress={() => send()} style={[styles.send, { backgroundColor: t.primary }]}>
            <Ionicons name="send" size={20} color={t.onPrimary} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Record a voice note" onPress={() => void startVoice()} style={[styles.send, { backgroundColor: t.primary }]}>
            <Ionicons name="mic" size={22} color={t.onPrimary} />
          </Pressable>
        )}
      </View>
      <Sheet visible={attachOpen} title="Attach" onClose={() => setAttachOpen(false)}>
        <Row icon="images-outline" title="Photo from gallery" onPress={() => void attach(pickPhoto)} chevron={false} />
        <Row icon="camera-outline" title="Take a photo" onPress={() => void attach(takePhoto)} chevron={false} />
        <Row icon="document-attach-outline" title="Document" subtitle="PDF, Word, Excel, PowerPoint, text" onPress={() => void attach(pickDocument)} chevron={false} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 16, marginHorizontal: 4 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  recText: { fontSize: 15, fontWeight: '600' },
  reply: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, paddingLeft: 10, marginHorizontal: 8, marginTop: 6, borderRadius: 8 },
  replyLabel: { fontSize: 12, fontWeight: '700', marginTop: 6 }
});
