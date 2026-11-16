import { useQuery } from '@tanstack/react-query';
import type { QuickReply, Template } from '@smart-reply/shared';
import { api, asItems } from '@/lib/api';
import { qk } from '../keys';

export function useApprovedTemplates(enabled = true) {
  return useQuery({
    queryKey: qk.templates('approved'),
    queryFn: async ({ signal }) => asItems(await api.get<Template[] | { items: Template[] }>('/templates', { status: 'approved' }, signal)),
    enabled,
    staleTime: 5 * 60_000
  });
}

export function useQuickReplies(enabled = true) {
  return useQuery({
    queryKey: qk.quickReplies,
    queryFn: async ({ signal }) => asItems(await api.get<QuickReply[] | { items: QuickReply[] }>('/quick-replies', undefined, signal)),
    enabled,
    staleTime: 5 * 60_000
  });
}

/** Quick replies whose command or title starts with what follows the `/`. */
export function matchQuickReplies(list: QuickReply[], typed: string): QuickReply[] {
  const q = typed.replace(/^\//, '').toLowerCase();
  if (!q) return list;
  return list.filter(r => r.command.toLowerCase().replace(/^\//, '').startsWith(q) || r.title.toLowerCase().includes(q));
}
