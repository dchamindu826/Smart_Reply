import { useQuery } from '@tanstack/react-query';
import type { Message } from '@smart-reply/shared';
import { api } from '@/lib/api';

/** Photos, videos, voice notes and documents in one chat (contact info panel). */
export function useConversationMedia(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-media', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => api.get<Message[]>(`/conversations/${conversationId}/media`)
  });
}
