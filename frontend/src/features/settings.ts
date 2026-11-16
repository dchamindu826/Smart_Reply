import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEntry,
  BusinessProfile,
  IntegrationStatus,
  IntegrationTestResponse,
  Page,
  WebhookEventRow,
  WhatsappAccountView
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

export type BusinessProfileInput = Omit<BusinessProfile, 'syncedAt'>;

export const settingsKeys = {
  businessProfile: ['business-profile'] as const,
  webhook: ['integrations', 'webhook'] as const,
  events: ['integrations', 'events'] as const,
  audit: (f: AuditFilter) => ['audit', f.actor ?? '', f.action ?? '', f.from ?? '', f.to ?? ''] as const
};

/* ───────── Business profile ───────── */

export function useBusinessProfile() {
  return useQuery({ queryKey: settingsKeys.businessProfile, queryFn: () => api.get<BusinessProfile>('/business-profile') });
}

/** Saves locally, then pushes to WhatsApp when the number is connected. Meta's error comes back as the API message. */
export function useSaveBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BusinessProfileInput) => api.put<BusinessProfile>('/business-profile', body),
    onSuccess: saved => qc.setQueryData(settingsKeys.businessProfile, saved)
  });
}

/* ───────── WhatsApp number (read only for managers) ───────── */

export function useWhatsappAccount(enabled = true) {
  return useQuery({ queryKey: qk.whatsapp, enabled, queryFn: () => api.get<WhatsappAccountView>('/whatsapp/account') });
}

/** Re-reads name, quality and limit from Meta. Changes nothing at Meta. */
export function useRefreshWhatsappAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<WhatsappAccountView>('/whatsapp/account/refresh'),
    onSuccess: view => qc.setQueryData(qk.whatsapp, view)
  });
}

/* ───────── Integrations ───────── */

export function useWebhookStatus() {
  return useQuery({ queryKey: settingsKeys.webhook, queryFn: () => api.get<IntegrationStatus>('/integrations/webhook'), refetchInterval: 30_000 });
}

export function useWebhookEvents() {
  return useQuery({ queryKey: settingsKeys.events, queryFn: () => api.get<WebhookEventRow[]>('/integrations/events'), refetchInterval: 30_000 });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IntegrationTestResponse>('/integrations/test'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}

/* ───────── Audit log ───────── */

export interface AuditFilter {
  actor?: string;
  action?: string;
  /** ISO times. */
  from?: string;
  to?: string;
}

export function useAuditLog(filter: AuditFilter) {
  return useInfiniteQuery({
    queryKey: settingsKeys.audit(filter),
    initialPageParam: '',
    queryFn: ({ pageParam }) => api.get<Page<AuditEntry>>('/audit', { ...filter, cursor: pageParam || undefined, limit: 50 }),
    getNextPageParam: last => last.nextCursor ?? undefined
  });
}

/* ───────── Display helpers for the number's health ───────── */

/** Meta's GREEN / YELLOW / RED rating as the words and colours the screens use. */
export function qualityView(q: WhatsappAccountView['qualityRating']): { text: string; cls: 'ok' | 'w' | 'b' | ''; color: string } {
  if (q === 'GREEN') return { text: 'High', cls: 'ok', color: 'var(--ok)' };
  if (q === 'YELLOW') return { text: 'Medium', cls: 'w', color: 'var(--warn)' };
  if (q === 'RED') return { text: 'Low', cls: 'b', color: 'var(--bad)' };
  return { text: 'Unknown', cls: '', color: 'var(--ink-2)' };
}

/** `TIER_1K` → `1K`; `TIER_UNLIMITED` → `Unlimited`; a bare number is formatted. */
export function limitShort(limit: string | null): string {
  if (!limit) return '—';
  const v = limit.trim().toUpperCase().replace(/^TIER_/, '');
  if (v === 'UNLIMITED') return 'Unlimited';
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : n.toLocaleString('en-GB');
  }
  return v;
}

/** `TIER_1K` → `1,000 customers / day`. */
export function limitLong(limit: string | null): string {
  const s = limitShort(limit);
  if (s === '—' || s === 'Unlimited') return s === 'Unlimited' ? 'Unlimited customers / day' : '—';
  const m = /^(\d+)K$/.exec(s);
  const n = m ? Number(m[1]) * 1000 : Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? `${n.toLocaleString('en-GB')} customers / day` : s;
}
