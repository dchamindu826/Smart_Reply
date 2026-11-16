import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  DashboardResponse,
  ExportResponse,
  Invoice,
  Money,
  MyDashboardResponse,
  PerformanceResponse,
  RangeQuery,
  ReportsResponse,
  UsageResponse
} from '@smart-reply/shared';
import { api } from '@/lib/api';

export type RangeKey = RangeQuery['range'];
export type ExportKind = 'contacts' | 'calls' | 'reports' | 'performance' | 'audit' | 'conversations';

/** Query keys for the insight screens. Mutations elsewhere invalidate `['insight']` to refresh them all. */
export const insightKeys = {
  all: ['insight'] as const,
  dashboard: ['insight', 'dashboard'] as const,
  myDashboard: ['insight', 'my-dashboard'] as const,
  reports: (range: RangeKey, from?: string, to?: string) => ['insight', 'reports', range, from ?? '', to ?? ''] as const,
  performance: (range: RangeKey) => ['insight', 'performance', range] as const,
  usage: (month: string) => ['insight', 'usage', month] as const,
  invoices: ['insight', 'invoices'] as const
};

/** Manager: today's tiles, the hourly chart and the team table. Refreshes every minute. */
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: insightKeys.dashboard,
    enabled,
    queryFn: () => api.get<DashboardResponse>('/dashboard'),
    refetchInterval: 60_000
  });
}

/** Staff: my day, including the calls I scheduled for today. */
export function useMyDashboard() {
  return useQuery({
    queryKey: insightKeys.myDashboard,
    queryFn: () => api.get<MyDashboardResponse>('/me/dashboard'),
    refetchInterval: 60_000
  });
}

/** `from` / `to` are ISO times and only used with `range: 'custom'`. */
export function useReports(range: RangeKey, from?: string, to?: string) {
  const custom = range === 'custom';
  return useQuery({
    queryKey: insightKeys.reports(range, custom ? from : undefined, custom ? to : undefined),
    enabled: !custom || Boolean(from && to),
    queryFn: () => api.get<ReportsResponse>('/reports', { range, from: custom ? from : undefined, to: custom ? to : undefined }),
    placeholderData: prev => prev
  });
}

export function useMyPerformance(range: RangeKey) {
  return useQuery({
    queryKey: insightKeys.performance(range),
    queryFn: () => api.get<PerformanceResponse>('/me/performance', { range }),
    placeholderData: prev => prev
  });
}

/** Estimated Meta usage for a month (`YYYY-MM`); empty string means the current month. */
export function useUsage(month: string, enabled = true) {
  return useQuery({
    queryKey: insightKeys.usage(month),
    enabled,
    queryFn: () => api.get<UsageResponse>('/billing/usage', { month: month || undefined }),
    placeholderData: prev => prev
  });
}

export function useInvoices() {
  return useQuery({ queryKey: insightKeys.invoices, queryFn: () => api.get<Invoice[]>('/billing/invoices') });
}

/** Ask the browser to download a file the API produced (a signed, short-lived link). */
export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** `POST /exports` → CSV download. */
export function useExport() {
  return useMutation({
    mutationFn: (input: { kind: ExportKind; params?: Record<string, string> }) =>
      api.post<ExportResponse>('/exports', { kind: input.kind, format: 'csv', params: input.params ?? {} }),
    onSuccess: res => downloadUrl(res.url, res.fileName)
  });
}

/* ───────── Formatting shared by the insight screens ───────── */

export function formatMoney(m: Money | null | undefined): string {
  if (!m) return '—';
  try {
    const f = new Intl.NumberFormat('en-GB', { style: 'currency', currency: m.currency });
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2;
    return f.format(m.amountMinor / 10 ** digits);
  } catch {
    return `${m.currency} ${(m.amountMinor / 100).toFixed(2)}`;
  }
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-GB');
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  custom: 'Custom range'
};

/** Short bar label for a `YYYY-MM-DD` day: weekday for a week or less, day of month otherwise. */
export function dayLabel(date: string, many: boolean): string {
  const d = new Date(`${date}T12:00:00`);
  return many ? String(d.getDate()) : d.toLocaleDateString('en-GB', { weekday: 'short' });
}

/** The current time, refreshed every `everyMs` so countdowns stay correct without impure renders. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
