import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BreakEntry, MeResponse, MyDashboardResponse, PerformanceResponse, PresenceInput, UpdateMeInput } from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '../keys';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: ({ signal }) => api.get<MeResponse>('/me', undefined, signal),
    staleTime: 5 * 60_000
  });
}

export function useIsManager(): boolean {
  const { data } = useMe();
  return data?.user.role === 'manager';
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeInput) => api.patch<MeResponse>('/me', body),
    onSuccess: me => qc.setQueryData(qk.me, me)
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post<void>('/me/password', body)
  });
}

export function useMyDashboard() {
  return useQuery({
    queryKey: qk.myDashboard,
    queryFn: ({ signal }) => api.get<MyDashboardResponse>('/me/dashboard', undefined, signal)
  });
}

export interface MyBreaks {
  usedMinutes: number;
  limitMinutes?: number;
  entries: BreakEntry[];
}

export function useMyBreaks() {
  return useQuery({
    queryKey: qk.myBreaks,
    queryFn: async ({ signal }) => {
      const r = await api.get<MyBreaks | BreakEntry[]>('/me/breaks', undefined, signal);
      if (Array.isArray(r)) return { usedMinutes: r.reduce((n, b) => n + b.minutes, 0), entries: r };
      return r;
    }
  });
}

export function useMyPerformance(range: 'today' | '7d' | '30d' | 'month') {
  return useQuery({
    queryKey: qk.myPerformance(range),
    queryFn: ({ signal }) => api.get<PerformanceResponse>('/me/performance', { range }, signal)
  });
}

export function useSetPresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PresenceInput) => api.put<unknown>('/me/presence', body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.staff });
      void qc.invalidateQueries({ queryKey: qk.myBreaks });
    }
  });
}
