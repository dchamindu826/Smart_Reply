import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Label, LabelColor } from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

export function useLabels() {
  return useQuery({ queryKey: qk.labels, queryFn: () => api.get<Label[]>('/labels') });
}

export interface LabelInput {
  name: string;
  color: LabelColor;
  meaning: string;
  autoRule: string;
}

function refresh(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: qk.labels });
  // Label names and colours show on contacts and chats.
  void qc.invalidateQueries({ queryKey: qk.contacts });
  void qc.invalidateQueries({ queryKey: qk.conversationsAll });
}

export function useSaveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: LabelInput }) =>
      id ? api.patch<Label>(`/labels/${id}`, input) : api.post<Label>('/labels', input),
    onSuccess: () => refresh(qc)
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/labels/${id}`),
    onSuccess: () => {
      refresh(qc);
      void qc.invalidateQueries({ queryKey: ['keyword-rules'] });
    }
  });
}
