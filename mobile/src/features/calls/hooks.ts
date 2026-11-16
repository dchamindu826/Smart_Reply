import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CallFilter, ScheduledCall } from '@smart-reply/shared';
import { api, asItems } from '@/lib/api';
import { qk } from '../keys';
import { usePaged } from '../paged';
import type { Call } from '@smart-reply/shared';

export function useCallLog(filter: CallFilter) {
  return usePaged<Call>(qk.callList(filter), '/calls', { filter });
}

export function useScheduledCalls() {
  return useQuery({
    queryKey: qk.scheduledCalls,
    queryFn: async ({ signal }) =>
      asItems(await api.get<ScheduledCall[] | { items: ScheduledCall[] }>('/scheduled-calls', undefined, signal))
  });
}

export function useScheduleCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { contactId: string; scheduledAt: string; note: string }) => api.post<ScheduledCall>('/scheduled-calls', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.scheduledCalls });
      void qc.invalidateQueries({ queryKey: qk.myDashboard });
    }
  });
}

export function useDeleteScheduledCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/scheduled-calls/${id}`),
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: qk.scheduledCalls });
      const prev = qc.getQueryData<ScheduledCall[]>(qk.scheduledCalls);
      qc.setQueryData<ScheduledCall[]>(qk.scheduledCalls, list => list?.filter(s => s.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(qk.scheduledCalls, ctx?.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.myDashboard })
  });
}
