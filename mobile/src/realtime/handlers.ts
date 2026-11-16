import type { QueryClient } from '@tanstack/react-query';
import type { Call, ServerToClientEvents, StaffMember } from '@smart-reply/shared';
import { storeContact } from '@/features/contacts/hooks';
import { storeConversation } from '@/features/conversations/hooks';
import { qk } from '@/features/keys';
import { applyPresence, applyStatus, upsertCall, upsertMessage, type Pages } from './cache';
import type { ToastLevel } from '@/ui/Toast';
import type { Message } from '@smart-reply/shared';

type Handlers = { [K in keyof ServerToClientEvents]?: ServerToClientEvents[K] };

/** Socket events that only touch the query cache (calls and session events are handled elsewhere). */
export function cacheHandlers(qc: QueryClient, toast: (text: string, level?: ToastLevel) => void): Handlers {
  let countsTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshCounts = () => {
    if (countsTimer) return;
    countsTimer = setTimeout(() => {
      countsTimer = null;
      void qc.invalidateQueries({ queryKey: qk.counts });
    }, 800);
  };

  return {
    'message.created': ({ message, conversation }) => {
      qc.setQueryData<Pages<Message>>(qk.messages(conversation.id), d => upsertMessage(d, message));
      storeConversation(qc, conversation);
      refreshCounts();
    },
    'message.status': ({ conversationId, messageId, status, error }) => {
      qc.setQueryData<Pages<Message>>(qk.messages(conversationId), d => applyStatus(d, messageId, status, error));
    },
    'conversation.updated': ({ conversation }) => {
      storeConversation(qc, conversation);
      refreshCounts();
    },
    'conversation.assigned': ({ conversation, byName }) => {
      storeConversation(qc, conversation);
      refreshCounts();
      toast(`${conversation.contact.name} was assigned to you by ${byName}`, 'info');
    },
    'contact.updated': ({ contact }) => storeContact(qc, contact),
    'presence.updated': ({ userId, channel, presence }) => {
      qc.setQueryData<StaffMember[]>(qk.staff, s => applyPresence(s, userId, channel, presence));
    },
    'call.updated': ({ call }: { call: Call }) => {
      qc.setQueriesData<Pages<Call>>({ queryKey: qk.calls }, d => upsertCall(d, call));
    },
    'template.status': () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
    notice: ({ text, level }) => toast(text, level)
  };
}

/** After a reconnect, anything may have changed while we were away. */
export function refetchAfterReconnect(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: qk.conversations });
  void qc.invalidateQueries({ queryKey: ['messages'] });
  void qc.invalidateQueries({ queryKey: ['conversation'] });
  void qc.invalidateQueries({ queryKey: qk.calls });
  void qc.invalidateQueries({ queryKey: qk.staff });
}
