import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  CONVERSATION_FILTERS,
  type Conversation,
  type ConversationCounts,
  type ConversationFilter,
  type FileRef,
  type MeResponse,
  type Message
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { uploadFile, type LocalFile } from '@/lib/upload';
import {
  TEMP_PREFIX,
  failTemp,
  patchConversation,
  removeMessage,
  replaceTemp,
  upsertConversation,
  upsertMessage,
  type Pages
} from '@/realtime/cache';
import { qk } from '../keys';
import { usePaged } from '../paged';

export function useConversationList(filter: ConversationFilter, search: string) {
  return usePaged<Conversation>(qk.conversationList(filter, search), '/conversations', { filter, search: search || undefined });
}

export function useCounts() {
  return useQuery({
    queryKey: qk.counts,
    queryFn: ({ signal }) => api.get<ConversationCounts>('/conversations/counts', undefined, signal),
    staleTime: 15_000
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: qk.conversation(id),
    queryFn: ({ signal }) => api.get<Conversation>(`/conversations/${id}`, undefined, signal),
    enabled: !!id
  });
}

export function useMessages(conversationId: string) {
  return usePaged<Message>(qk.messages(conversationId), `/conversations/${conversationId}/messages`, {}, !!conversationId);
}

/** Writes a fresh conversation into its detail entry and every cached list. */
export function storeConversation(qc: QueryClient, conv: Conversation): void {
  qc.setQueryData(qk.conversation(conv.id), conv);
  const me = qc.getQueryData<MeResponse>(qk.me);
  const myId = me?.user.id ?? null;
  for (const [key] of qc.getQueriesData<Pages<Conversation>>({ queryKey: ['conversations', 'list'] })) {
    const filter = key[2];
    if (typeof filter !== 'string' || !(CONVERSATION_FILTERS as readonly string[]).includes(filter)) continue;
    qc.setQueryData<Pages<Conversation>>(key, d => upsertConversation(d, conv, filter as ConversationFilter, myId));
  }
}

function useConversationAction<TBody>(id: string, run: (body: TBody) => Promise<Conversation>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: conv => {
      storeConversation(qc, conv);
      void qc.invalidateQueries({ queryKey: qk.counts });
    }
  });
}

export function useResolve(id: string) {
  return useConversationAction<boolean>(id, resolve => api.post<Conversation>(`/conversations/${id}/${resolve ? 'resolve' : 'reopen'}`));
}

export function useSetState(id: string) {
  return useConversationAction<{ favorite?: boolean; archived?: boolean }>(id, body => api.put<Conversation>(`/conversations/${id}/state`, body));
}

export function useSetBot(id: string) {
  return useConversationAction<boolean>(id, active => api.post<Conversation>(`/conversations/${id}/bot`, { active }));
}

export function useMarkRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/conversations/${id}/read`),
    onMutate: () => {
      qc.setQueryData<Conversation>(qk.conversation(id), c => (c ? { ...c, unreadCount: 0 } : c));
      qc.setQueriesData<Pages<Conversation>>({ queryKey: ['conversations', 'list'] }, d => patchConversation(d, id, { unreadCount: 0 }));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.counts })
  });
}

/* ───────── Sending ───────── */

export interface Outgoing {
  tempId: string;
  text: string;
  files: LocalFile[];
  replyToId?: string;
  voice?: boolean;
  /** Internal note: never sent to the customer. */
  note?: boolean;
  /** Voice note length, for the optimistic bubble. */
  durationSeconds?: number;
}

let tempSeq = 0;
export function newTempId(): string {
  tempSeq += 1;
  return `${TEMP_PREFIX}${Date.now()}-${tempSeq}`;
}

function kindOf(mime: string): FileRef['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

/** The bubble shown while the message uploads and sends. */
export function optimisticMessage(conversationId: string, out: Outgoing, me: MeResponse | undefined): Message {
  const attachments: FileRef[] = out.files.map((f, i) => ({
    id: `${out.tempId}-f${i}`,
    kind: kindOf(f.mime),
    name: f.name,
    mime: f.mime,
    sizeBytes: f.size ?? 0,
    url: f.uri,
    durationSeconds: out.durationSeconds ?? null,
    voice: !!out.voice
  }));
  const first = attachments[0];
  return {
    id: out.tempId,
    conversationId,
    direction: out.note ? 'note' : 'out',
    type: out.note ? 'note' : first ? first.kind : 'text',
    body: out.text,
    sender: { kind: 'user', userId: me?.user.id ?? null, name: me?.user.name ?? null },
    templateName: null,
    buttons: [],
    attachments,
    status: 'queued',
    error: null,
    replyToId: out.replyToId ?? null,
    createdAt: new Date().toISOString()
  };
}

async function deliver(conversationId: string, out: Outgoing): Promise<Message[]> {
  const fileIds: string[] = [];
  for (const f of out.files) fileIds.push(await uploadFile(f));
  if (out.note) {
    const note = await api.post<Message>(`/conversations/${conversationId}/notes`, { text: out.text, fileIds });
    return [note];
  }
  return api.post<Message[]>(
    `/conversations/${conversationId}/messages`,
    { text: out.text, fileIds, replyToId: out.replyToId, voice: !!out.voice },
    { idempotencyKey: out.tempId }
  );
}

const pending = new Map<string, Outgoing>();

/** Optimistic send: a temporary bubble appears at once and is replaced by the server's message. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const key = qk.messages(conversationId);
  return useMutation({
    mutationFn: (out: Outgoing) => deliver(conversationId, out),
    onMutate: async out => {
      pending.set(out.tempId, out);
      await qc.cancelQueries({ queryKey: key });
      const me = qc.getQueryData<MeResponse>(qk.me);
      qc.setQueryData<Pages<Message>>(key, d => upsertMessage(d, optimisticMessage(conversationId, out, me)));
    },
    onSuccess: (created, out) => {
      pending.delete(out.tempId);
      qc.setQueryData<Pages<Message>>(key, d => replaceTemp(d, out.tempId, created));
      void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
    },
    onError: (err, out) => {
      qc.setQueryData<Pages<Message>>(key, d => failTemp(d, out.tempId, errorMessage(err)));
    }
  });
}

/** For a failed optimistic bubble: what was being sent, so it can be retried. */
export function pendingOutgoing(tempId: string): Outgoing | undefined {
  return pending.get(tempId);
}

export function useDiscardFailed(conversationId: string) {
  const qc = useQueryClient();
  return (tempId: string) => {
    pending.delete(tempId);
    qc.setQueryData<Pages<Message>>(qk.messages(conversationId), d => removeMessage(d, tempId));
  };
}

function useSendAndStore<TVars>(conversationId: string, run: (v: TVars) => Promise<Message | Message[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: result => {
      const list = Array.isArray(result) ? result : [result];
      qc.setQueryData<Pages<Message>>(qk.messages(conversationId), d => list.reduce((acc, m) => upsertMessage(acc, m), d));
      void qc.invalidateQueries({ queryKey: qk.conversation(conversationId) });
    }
  });
}

export function useSendTemplate(conversationId: string) {
  return useSendAndStore<{ templateId: string; variables: string[] }>(conversationId, body =>
    api.post<Message>(`/conversations/${conversationId}/templates`, body)
  );
}

export function useSendQuickReply(conversationId: string) {
  return useSendAndStore<string>(conversationId, qrId => api.post<Message[]>(`/conversations/${conversationId}/quick-replies/${qrId}`));
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { contactId: string; templateId: string; variables: string[] }) => api.post<Conversation>('/conversations', body),
    onSuccess: conv => {
      storeConversation(qc, conv);
      void qc.invalidateQueries({ queryKey: qk.messages(conv.id) });
    }
  });
}

export function useOpenContactChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => api.get<Conversation>(`/conversations/by-contact/${contactId}`),
    onSuccess: conv => qc.setQueryData(qk.conversation(conv.id), conv)
  });
}
