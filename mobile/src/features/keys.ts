import type { CallFilter, ConversationFilter } from '@smart-reply/shared';

/** Every TanStack Query key in the app, so socket updates and mutations hit the same entries. */
export const qk = {
  me: ['me'] as const,
  conversations: ['conversations'] as const,
  conversationList: (filter: ConversationFilter, search: string) => ['conversations', 'list', filter, search] as const,
  counts: ['conversations', 'counts'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  contacts: ['contacts'] as const,
  contactList: (search: string, owner: string) => ['contacts', 'list', search, owner] as const,
  contact: (id: string) => ['contact', id] as const,
  ownerHistory: (contactId: string) => ['contact', contactId, 'owner-history'] as const,
  calls: ['calls'] as const,
  callList: (filter: CallFilter) => ['calls', 'list', filter] as const,
  scheduledCalls: ['scheduled-calls'] as const,
  templates: (status: string) => ['templates', status] as const,
  quickReplies: ['quick-replies'] as const,
  staff: ['staff'] as const,
  myDashboard: ['me', 'dashboard'] as const,
  myBreaks: ['me', 'breaks'] as const,
  myPerformance: (range: string) => ['me', 'performance', range] as const
};
