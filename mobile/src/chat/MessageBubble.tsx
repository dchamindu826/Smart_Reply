import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Message } from '@smart-reply/shared';
import { clockTime } from '@/lib/time';
import { useTheme } from '@/ui/theme';
import { Attachment } from './Attachment';
import { StatusTicks, statusLabel } from './StatusTicks';

interface Props {
  message: Message;
  /** The quoted message, when this one is a reply and the original is loaded. */
  quoted?: Message;
  onLongPress?: (m: Message) => void;
}

function SystemLine({ message }: { message: Message }) {
  const t = useTheme();
  return (
    <View style={styles.systemWrap}>
      <Text accessibilityRole="text" style={[styles.system, { backgroundColor: t.card, color: t.text2 }]}>
        {message.body}
      </Text>
    </View>
  );
}

function Quote({ message }: { message: Message }) {
  const t = useTheme();
  const preview = message.body || (message.attachments[0] ? message.attachments[0].name : 'Message');
  return (
    <View style={[styles.quote, { backgroundColor: t.card2, borderLeftColor: t.primary }]}>
      <Text style={[styles.quoteName, { color: t.primary }]}>{message.direction === 'in' ? 'Customer' : (message.sender.name ?? 'You')}</Text>
      <Text numberOfLines={2} style={[styles.quoteText, { color: t.text2 }]}>
        {preview}
      </Text>
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({ message: m, quoted, onLongPress }: Props) {
  const t = useTheme();
  if (m.direction === 'system' || m.type === 'system') return <SystemLine message={m} />;

  const mine = m.direction === 'out';
  const note = m.direction === 'note';
  const bg = note ? t.bubbleNote : mine ? t.bubbleOut : t.bubbleIn;
  const textColor = note ? t.bubbleNoteText : t.text;
  const showSender = (mine || note) && m.sender.name && m.sender.kind !== 'customer';
  const isTemplate = m.type === 'template';
  const body = m.type === 'reaction' ? `Reacted ${m.body}` : m.type === 'unsupported' && !m.body ? 'This message type is not supported.' : m.body;
  const voiceOnly = m.attachments.length > 0 && m.attachments.every(a => a.kind === 'audio');

  const a11y = [
    note ? 'Internal note' : mine ? 'You sent' : 'Customer sent',
    m.attachments.map(a => a.kind).join(', '),
    body,
    clockTime(m.createdAt),
    mine ? statusLabel(m.status) : null,
    m.status === 'failed' && m.error ? m.error : null
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={[styles.wrap, { alignItems: mine || note ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        accessibilityLabel={a11y}
        accessibilityHint="Long press for actions"
        onLongPress={onLongPress ? () => onLongPress(m) : undefined}
        delayLongPress={300}
        style={[styles.bubble, { backgroundColor: bg }, mine || note ? styles.right : styles.left]}
      >
        {note ? (
          <View style={styles.noteHead}>
            <Ionicons name="lock-closed" size={12} color={t.bubbleNoteText} />
            <Text style={[styles.noteLabel, { color: t.bubbleNoteText }]}>Internal note{m.sender.name ? ` · ${m.sender.name}` : ''}</Text>
          </View>
        ) : showSender ? (
          <Text style={[styles.sender, { color: t.primary }]}>
            {m.sender.kind === 'bot' ? `🤖 ${m.sender.name ?? 'Bot'}` : m.sender.name}
          </Text>
        ) : null}
        {isTemplate && m.templateName ? (
          <Text style={[styles.templateName, { color: t.text3 }]}>Template · {m.templateName}</Text>
        ) : null}
        {quoted ? <Quote message={quoted} /> : null}
        {m.attachments.map(a => (
          <Attachment key={a.id} file={a} />
        ))}
        {body ? <Text style={[styles.body, { color: textColor }]}>{body}</Text> : null}
        <View style={[styles.meta, voiceOnly && styles.metaVoice]}>
          <Text style={[styles.time, { color: t.text3 }]}>{clockTime(m.createdAt)}</Text>
          {mine ? <StatusTicks status={m.status} /> : null}
        </View>
        {m.status === 'failed' ? (
          <Text style={[styles.error, { color: t.bad }]}>{m.error || 'Not sent.'}</Text>
        ) : null}
        {m.buttons.length > 0 ? (
          <View style={[styles.buttons, { borderTopColor: t.rule }]}>
            {m.buttons.map(b => (
              <Text key={b} style={[styles.button, { color: t.info, borderBottomColor: t.rule }]}>
                {b}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 10, marginVertical: 2 },
  bubble: { maxWidth: '84%', borderRadius: 12, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  right: { borderTopRightRadius: 3 },
  left: { borderTopLeftRadius: 3 },
  sender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  noteLabel: { fontSize: 12, fontWeight: '700' },
  templateName: { fontSize: 11, marginBottom: 2 },
  body: { fontSize: 15.5, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  metaVoice: { marginTop: -2 },
  time: { fontSize: 11 },
  error: { fontSize: 12, marginTop: 2, maxWidth: 260 },
  buttons: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  button: { textAlign: 'center', paddingVertical: 8, fontSize: 14, fontWeight: '600', borderBottomWidth: StyleSheet.hairlineWidth },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  quoteName: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 13 },
  systemWrap: { alignItems: 'center', marginVertical: 6, paddingHorizontal: 24 },
  system: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', textAlign: 'center' }
});
