import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Message, QuickReply } from '@smart-reply/shared';
import { useCalls } from '@/calls/CallProvider';
import { CALLS_NEED_DEV_BUILD, callingAvailable } from '@/calls/webrtc';
import { ChatMenu } from '@/chat/ChatMenu';
import { ChatTitle } from '@/chat/ChatTitle';
import { Composer, type ComposerSend } from '@/chat/Composer';
import { MessageBubble } from '@/chat/MessageBubble';
import { WindowClosedBar } from '@/chat/WindowClosedBar';
import {
  newTempId,
  pendingOutgoing,
  useConversation,
  useDiscardFailed,
  useMarkRead,
  useMessages,
  useResolve,
  useSendMessage,
  useSendQuickReply,
  useSetBot,
  useSetState
} from '@/features/conversations/hooks';
import { useMe } from '@/features/me/hooks';
import { errorMessage } from '@/lib/errors';
import { windowState } from '@/lib/time';
import { useNow } from '@/lib/useNow';
import { setOpenConversation } from '@/push/push';
import { allMessages, isTempId, withDaySeparators, type ThreadRow } from '@/realtime/cache';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { ErrorView, FooterSpinner, Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

function DayRow({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={styles.dayWrap}>
      <Text accessibilityRole="header" style={[styles.day, { backgroundColor: t.card, color: t.text2 }]}>
        {label}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const now = useNow(30_000);
  const me = useMe().data;
  const conv = useConversation(id);
  const messages = useMessages(id);
  const send = useSendMessage(id);
  const sendQuick = useSendQuickReply(id);
  const discard = useDiscardFailed(id);
  const markRead = useMarkRead(id);
  const resolve = useResolve(id);
  const setState = useSetState(id);
  const setBot = useSetBot(id);
  const calls = useCalls();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteMode, setNoteMode] = useState(false);

  const c = conv.data;
  const list = useMemo(() => allMessages(messages.data), [messages.data]);
  const byId = useMemo(() => new Map(list.map(m => [m.id, m])), [list]);
  const rows = useMemo(() => withDaySeparators(list), [list]);
  const win = windowState(c?.windowExpiresAt ?? null, now);
  const newestIncoming = list.find(m => m.direction === 'in')?.id;

  // Suppress banners for this chat while it is on screen.
  useEffect(() => {
    setOpenConversation(id);
    return () => setOpenConversation(null);
  }, [id]);

  // Mark read on open and whenever a new customer message arrives while open.
  const { mutate: markReadNow } = markRead;
  useEffect(() => {
    if (id) markReadNow();
  }, [id, newestIncoming, markReadNow]);

  const onSend = useCallback(
    (s: ComposerSend) => {
      send.mutate({ tempId: newTempId(), text: s.text, files: s.files, replyToId: s.replyToId, voice: s.voice, note: s.note, durationSeconds: s.durationSeconds });
      setNoteMode(false);
    },
    [send]
  );

  const onQuickReply = useCallback(
    (qr: QuickReply) => {
      sendQuick.mutate(qr.id, { onError: e => toast(errorMessage(e), 'error') });
    },
    [sendQuick, toast]
  );

  const onLongPress = useCallback(
    (m: Message) => {
      if (isTempId(m.id)) {
        if (m.status !== 'failed') return;
        const out = pendingOutgoing(m.id);
        Alert.alert('Message not sent', m.error ?? undefined, [
          { text: 'Delete', style: 'destructive', onPress: () => discard(m.id) },
          ...(out ? [{ text: 'Try again', onPress: () => send.mutate(out) }] : []),
          { text: 'Cancel', style: 'cancel' as const }
        ]);
        return;
      }
      if (m.direction === 'system') return;
      Alert.alert('Message', undefined, [
        { text: 'Reply', onPress: () => setReplyTo(m) },
        { text: 'Cancel', style: 'cancel' }
      ]);
    },
    [discard, send]
  );

  const startCall = useCallback(() => {
    if (!c) return;
    if (!me?.features.calling) {
      Alert.alert('Calling is not enabled', 'WhatsApp calling is not turned on for your company.');
      return;
    }
    if (!me.permissions.makeCalls) {
      Alert.alert('Not allowed', 'Your manager has not allowed you to make calls.');
      return;
    }
    if (!callingAvailable()) {
      Alert.alert('Calls need the full app', CALLS_NEED_DEV_BUILD);
      return;
    }
    void calls.startCall({
      contactId: c.contactId,
      name: c.contact.name,
      initials: c.contact.initials,
      phone: c.contact.phone,
      avatarColor: c.contact.avatarColor
    });
  }, [c, me, calls]);

  const run = (p: Promise<unknown>) => p.catch((e: unknown) => toast(errorMessage(e), 'error'));
  const openInfo = () => c && router.push({ pathname: '/contact/[id]', params: { id: c.contactId, conversationId: c.id } });

  const renderItem = useCallback(
    ({ item }: { item: ThreadRow }) =>
      item.kind === 'day' ? (
        <DayRow label={item.label} />
      ) : (
        <MessageBubble
          message={item.message}
          quoted={item.message.replyToId ? byId.get(item.message.replyToId) : undefined}
          onLongPress={onLongPress}
        />
      ),
    [byId, onLongPress]
  );

  if (conv.isPending) return <Loading />;
  if (!c) return <ErrorView error={conv.error} onRetry={() => void conv.refetch()} />;

  const canTemplate = me?.permissions.sendTemplates ?? true;
  return (
    <View style={[styles.screen, { backgroundColor: t.chatBg }]}>
      <Stack.Screen
        options={{
          headerTitle: () => <ChatTitle conversation={c} onPress={openInfo} />,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Call ${c.contact.name}`} onPress={startCall} hitSlop={8} style={styles.headerBtn}>
                <Ionicons name="call" size={22} color={t.onHeader} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.headerBtn}>
                <Ionicons name="ellipsis-vertical" size={22} color={t.onHeader} />
              </Pressable>
            </View>
          )
        }}
      />
      <OfflineBanner />
      {c.botActive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="The bot is replying in this chat. Take over"
          onPress={() => void run(setBot.mutateAsync(false))}
          style={[styles.botBar, { backgroundColor: t.card }]}
        >
          <Ionicons name="hardware-chip-outline" size={18} color={t.info} />
          <Text style={[styles.botText, { color: t.text2 }]}>The bot is replying.</Text>
          <Text style={[styles.botAction, { color: t.primary }]}>Take over</Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {messages.isPending ? (
          <Loading />
        ) : messages.isError && list.length === 0 ? (
          <ErrorView error={messages.error} onRetry={() => void messages.refetch()} />
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={r => r.key}
            renderItem={renderItem}
            onEndReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={messages.isFetchingNextPage ? <FooterSpinner /> : null}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          />
        )}
        <View style={{ paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }}>
          {win.open || noteMode ? (
            <Composer
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              onSend={onSend}
              onQuickReply={onQuickReply}
              notesOnly={!win.open}
            />
          ) : (
            <WindowClosedBar
              canSend={canTemplate}
              onTemplate={() => router.push({ pathname: '/template', params: { conversationId: c.id } })}
              onNote={() => setNoteMode(true)}
            />
          )}
        </View>
      </KeyboardAvoidingView>
      <ChatMenu
        visible={menuOpen}
        conversation={c}
        onClose={() => setMenuOpen(false)}
        onInfo={openInfo}
        onResolve={r => void run(resolve.mutateAsync(r)).then(() => toast(r ? 'Chat resolved' : 'Chat reopened', 'success'))}
        onFavorite={on => void run(setState.mutateAsync({ favorite: on }))}
        onArchive={on => void run(setState.mutateAsync({ archived: on }))}
        onBot={active => void run(setBot.mutateAsync(active))}
        onSchedule={() => router.push({ pathname: '/schedule-call', params: { contactId: c.contactId, contactName: c.contact.name } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  listContent: { paddingVertical: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { paddingHorizontal: 10 },
  dayWrap: { alignItems: 'center', marginVertical: 8 },
  day: { fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  botBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  botText: { flex: 1, fontSize: 13 },
  botAction: { fontSize: 14, fontWeight: '700' }
});
