import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Booking,
  Call,
  CallFilter,
  CallSettings,
  CallSettingsInput,
  ExportResponse,
  ForwardingRules,
  IvrMenu,
  IvrTestResult,
  Page,
  ScheduledCall
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { uploadFile } from '@/lib/upload';

/** Body of `PUT /ivr` (shared `ivrSchema`). */
export type IvrInput = Omit<IvrMenu, 'greetingAudio' | 'stageBRequired'> & { greetingFileId: string | null };

/* ───────── Form drafts over server data ───────── */

/**
 * A local, editable copy of server data for settings forms. The draft follows the server
 * value until the user edits it, and starts over whenever the server value changes (after a
 * save or a refetch). Returns `[draft, update, reset]`; `draft` is null while loading.
 */
export function useServerDraft<S, D>(server: S | undefined, init: (s: S) => D): [D | null, (fn: (d: D) => D) => void, () => void] {
  const [edit, setEdit] = useState<{ base: S; value: D } | null>(null);
  const value = server === undefined ? null : edit && edit.base === server ? edit.value : init(server);
  const update = (fn: (d: D) => D) => {
    if (server === undefined) return;
    setEdit(prev => ({ base: server, value: fn(prev && prev.base === server ? prev.value : init(server)) }));
  };
  return [value, update, () => setEdit(null)];
}

/* ───────── Call log ───────── */

export interface CallLogParams {
  filter: CallFilter;
  staff?: string;
  search?: string;
  from?: string;
  to?: string;
}

const PAGE = 50;

/** The call log with server-side filters and cursor paging ("Load more"). Lives under `['calls', …]` so call events refresh it. */
export function useCallLog(params: CallLogParams) {
  return useInfiniteQuery({
    queryKey: [...qk.calls, 'log', params] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<Page<Call>>('/calls', {
        filter: params.filter,
        staff: params.staff,
        search: params.search,
        from: params.from,
        to: params.to,
        cursor: pageParam ?? undefined,
        limit: PAGE
      }),
    getNextPageParam: last => last.nextCursor
  });
}

export function useCallNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ callId, note }: { callId: string; note: string }) => api.post<Call>(`/calls/${callId}/notes`, { note }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.calls })
  });
}

export function useSummaryToChat() {
  return useMutation({ mutationFn: (callId: string) => api.post<Call>(`/calls/${callId}/summary-to-chat`) });
}

/** Manager: CSV of the call log for a window (`POST /exports`). Returns a download link. */
export function useExportCalls() {
  return useMutation({
    mutationFn: (params: { range?: string; from?: string; to?: string }) => {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) if (v) clean[k] = v;
      return api.post<ExportResponse>('/exports', { kind: 'calls', format: 'csv', params: clean });
    }
  });
}

/* ───────── Scheduled calls ───────── */

const scheduledKey = ['scheduled-calls'] as const;

/** Managers get every scheduled call; staff only their own (the API filters). */
export function useScheduledCalls() {
  return useQuery({ queryKey: scheduledKey, queryFn: () => api.get<ScheduledCall[]>('/scheduled-calls') });
}

export function useCreateScheduledCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { contactId: string; userId?: string; scheduledAt: string; note: string }) => api.post<ScheduledCall>('/scheduled-calls', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: scheduledKey })
  });
}

export function useCancelScheduledCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/scheduled-calls/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: scheduledKey })
  });
}

export function useDoneScheduledCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ScheduledCall>(`/scheduled-calls/${id}/done`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: scheduledKey })
  });
}

/* ───────── Call settings (manager) ───────── */

export function useCallSettings(enabled = true) {
  return useQuery({ queryKey: qk.callSettings, queryFn: () => api.get<CallSettings>('/call-settings'), enabled });
}

export function useSaveCallSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CallSettingsInput) => api.put<CallSettings>('/call-settings', body),
    onSuccess: saved => {
      qc.setQueryData(qk.callSettings, saved);
      void qc.invalidateQueries({ queryKey: qk.forwarding });
    }
  });
}

export function useEnableCalling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CallSettings>('/call-settings/enable-calling'),
    onSuccess: saved => qc.setQueryData(qk.callSettings, saved),
    onError: () => void qc.invalidateQueries({ queryKey: qk.callSettings })
  });
}

/* ───────── Forwarding ───────── */

export function useCompanyForwarding(enabled = true) {
  return useQuery({ queryKey: qk.forwarding, queryFn: () => api.get<ForwardingRules>('/forwarding'), enabled });
}

export function useSaveCompanyForwarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: ForwardingRules) => api.put<ForwardingRules>('/forwarding', rules),
    onSuccess: saved => {
      qc.setQueryData(qk.forwarding, saved);
      void qc.invalidateQueries({ queryKey: qk.callSettings });
    }
  });
}

export function useMyForwarding() {
  return useQuery({ queryKey: qk.myForwarding, queryFn: () => api.get<ForwardingRules>('/me/forwarding') });
}

export function useSaveMyForwarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: ForwardingRules) => api.put<ForwardingRules>('/me/forwarding', rules),
    onSuccess: saved => qc.setQueryData(qk.myForwarding, saved)
  });
}

/* ───────── IVR (manager) ───────── */

export function useIvrMenu(enabled = true) {
  return useQuery({ queryKey: qk.ivr, queryFn: () => api.get<IvrMenu>('/ivr'), enabled });
}

export function useSaveIvr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IvrInput) => api.put<IvrMenu>('/ivr', body),
    onSuccess: saved => qc.setQueryData(qk.ivr, saved)
  });
}

export function useTestIvr() {
  return useMutation({ mutationFn: (keys: string) => api.post<IvrTestResult>('/ivr/test', { keys }) });
}

/** Upload an IVR greeting; returns the file id to put in `greetingFileId`. */
export function useUploadIvrGreeting() {
  return useMutation({ mutationFn: (file: File) => uploadFile(file, file.name, 'ivr') });
}

/* ───────── Bookings (made by the AI voice agent) ───────── */

const bookingsKey = ['bookings'] as const;

export function useBookings(params: { from?: string; status?: Booking['status'] }) {
  return useQuery({ queryKey: [...bookingsKey, params] as const, queryFn: () => api.get<Booking[]>('/bookings', params) });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: Booking['status'] }) => api.patch<Booking>(`/bookings/${v.id}`, { status: v.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: bookingsKey })
  });
}
