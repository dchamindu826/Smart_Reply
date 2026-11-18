import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiAddon, AiBotLog, AiBotSettingsSummary, AiSettingsInput } from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

export function useAiStatus(enabled = true) {
  return useQuery({ queryKey: qk.aiStatus, queryFn: () => api.get<AiAddon>('/ai/status'), enabled });
}

export function useAiSettingsSummary(enabled = true) {
  return useQuery({ queryKey: qk.aiSettings, queryFn: () => api.get<AiBotSettingsSummary>('/ai/settings'), enabled });
}

export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AiSettingsInput) => api.put<AiBotSettingsSummary>('/ai/settings', data),
    onSuccess: settings => {
      qc.setQueryData(qk.aiSettings, settings);
      qc.invalidateQueries({ queryKey: qk.aiSettings });
      qc.invalidateQueries({ queryKey: qk.aiStatus });
    }
  });
}

export function useAiLogs(channel: 'all' | 'chat' | 'call', enabled = true) {
  return useQuery({
    queryKey: [...qk.aiLogs, channel] as const,
    queryFn: () => api.get<AiBotLog[]>('/ai/logs', { channel: channel === 'all' ? undefined : channel }),
    enabled
  });
}

export function useRequestAiActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api.post<AiAddon>('/ai/activation-request', { message }),
    onSuccess: addon => qc.setQueryData(qk.aiStatus, addon)
  });
}
