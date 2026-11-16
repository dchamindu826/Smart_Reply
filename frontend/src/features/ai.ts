import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiAddon, AiBotLog, AiBotSettingsSummary } from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/**
 * Manager's read-only view of the AI bot (AGENTS.md rule 11). LUMI AI's system admin activates,
 * configures and trains it; the only write a manager has is asking for activation.
 */
export function useAiStatus(enabled = true) {
  return useQuery({ queryKey: qk.aiStatus, queryFn: () => api.get<AiAddon>('/ai/status'), enabled });
}

export function useAiSettingsSummary(enabled = true) {
  return useQuery({ queryKey: qk.aiSettings, queryFn: () => api.get<AiBotSettingsSummary>('/ai/settings'), enabled });
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
