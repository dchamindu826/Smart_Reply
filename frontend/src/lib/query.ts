import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2
      },
      mutations: { retry: false }
    }
  });
}

/** Query keys in one place so socket events and mutations update the same caches. */
export const qk = {
  me: ['me'] as const,
  staff: ['staff'] as const,
  presence: ['presence'] as const,
  conversations: (filter = 'all') => ['conversations', filter] as const,
  conversationsAll: ['conversations'] as const,
  counts: ['conversation-counts'] as const,
  messages: (id: string) => ['messages', id] as const,
  contacts: ['contacts'] as const,
  contactHistory: (id: string) => ['contact-history', id] as const,
  calls: ['calls'] as const,
  activeCalls: ['calls', 'active'] as const,
  templates: ['templates'] as const,
  quickReplies: ['quick-replies'] as const,
  products: ['products'] as const,
  collections: ['collections'] as const,
  media: ['media'] as const,
  mediaCategories: ['media-categories'] as const,
  labels: ['labels'] as const,
  callSettings: ['call-settings'] as const,
  ivr: ['ivr'] as const,
  forwarding: ['forwarding'] as const,
  myForwarding: ['my-forwarding'] as const,
  aiStatus: ['ai-status'] as const,
  aiSettings: ['ai-settings'] as const,
  aiLogs: ['ai-logs'] as const,
  whatsapp: ['whatsapp-account'] as const,
  myBreaks: ['my-breaks'] as const
};
