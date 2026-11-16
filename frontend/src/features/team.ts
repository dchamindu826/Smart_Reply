/**
 * Team data for the manager screens: staff, invites, seats, roles, breaks, assignment and
 * keyword rules, targets and the progress report.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AssignmentRules,
  CreateInviteInput,
  Invite,
  KeywordRule,
  ProgressResponse,
  RolesResponse,
  SeatsResponse,
  StaffMember,
  StaffPermissions,
  StaffSummary,
  StaffTarget,
  UpdateStaffInput,
  UserBreaks
} from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** Keys live under `qk.staff` where they describe people, so invalidating `qk.staff` refreshes them too. */
export const teamKeys = {
  all: [...qk.staff, 'all'] as const,
  invites: [...qk.staff, 'invites'] as const,
  summary: (id: string) => [...qk.staff, 'summary', id] as const,
  seats: ['seats'] as const,
  roles: ['roles'] as const,
  breaks: (date: string) => ['breaks', date] as const,
  assignment: ['assignment-rules'] as const,
  keywordRules: ['keyword-rules'] as const,
  targets: ['targets'] as const,
  progress: (range: string) => ['progress', range] as const
};

export type ProgressRange = 'today' | '7d' | '30d' | 'month';

function refreshPeople(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: qk.staff });
  void qc.invalidateQueries({ queryKey: teamKeys.seats });
}

/* ───────── Staff ───────── */

/** Everyone in the company, disabled people included (manager only). */
export function useAllStaff(enabled = true) {
  return useQuery({
    queryKey: teamKeys.all,
    enabled,
    queryFn: () => api.get<StaffMember[]>('/staff', { include: 'disabled' })
  });
}

export function useStaffSummary(id: string | null) {
  return useQuery({
    queryKey: teamKeys.summary(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: () => api.get<StaffSummary>(`/staff/${id}/summary`)
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateStaffInput }) => api.patch<StaffMember>(`/staff/${id}`, patch),
    onSuccess: (_m, vars) => {
      refreshPeople(qc);
      if (vars.patch.status) {
        void qc.invalidateQueries({ queryKey: qk.contacts });
        void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      }
    }
  });
}

/** Remove (disable) a person: their sessions end and their customers go back to the team pool. */
export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/staff/${id}`),
    onSuccess: () => {
      refreshPeople(qc);
      void qc.invalidateQueries({ queryKey: qk.contacts });
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
    }
  });
}

/* ───────── Invites and seats ───────── */

export function useInvites(enabled = true) {
  return useQuery({ queryKey: teamKeys.invites, enabled, queryFn: () => api.get<Invite[]>('/staff/invites') });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteInput) => api.post<Invite>('/staff/invites', input),
    onSuccess: () => refreshPeople(qc)
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Invite>(`/staff/invites/${id}/resend`),
    onSuccess: () => refreshPeople(qc)
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/staff/invites/${id}`),
    onSuccess: () => refreshPeople(qc)
  });
}

export function useSeats(enabled = true) {
  return useQuery({ queryKey: teamKeys.seats, enabled, queryFn: () => api.get<SeatsResponse>('/seats') });
}

/** Seats in use, counting pending invites, against the plan's limit. */
export function seatsFull(s: SeatsResponse | undefined): boolean {
  return Boolean(s && s.used + s.pendingInvites >= s.limit);
}

/* ───────── Roles ───────── */

export function useRoles(enabled = true) {
  return useQuery({ queryKey: teamKeys.roles, enabled, queryFn: () => api.get<RolesResponse>('/roles') });
}

export function useUpdateRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (staff: Partial<StaffPermissions>) => api.patch<RolesResponse>('/roles/staff', { staff }),
    onSuccess: data => {
      qc.setQueryData(teamKeys.roles, data);
      void qc.invalidateQueries({ queryKey: qk.staff });
    }
  });
}

/* ───────── Breaks ───────── */

/** The company's break log for one day (`today` = the company's today). */
export function useBreaks(date: string | 'today' = 'today', enabled = true) {
  return useQuery({
    queryKey: teamKeys.breaks(date),
    enabled,
    queryFn: () => api.get<UserBreaks[]>('/breaks', { date: date === 'today' ? undefined : date }),
    refetchInterval: 60_000
  });
}

/* ───────── Assignment and keyword rules ───────── */

export function useAssignmentRules(enabled = true) {
  return useQuery({ queryKey: teamKeys.assignment, enabled, queryFn: () => api.get<AssignmentRules>('/assignment-rules') });
}

export function useSaveAssignmentRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: AssignmentRules) => api.put<AssignmentRules>('/assignment-rules', rules),
    onSuccess: data => qc.setQueryData(teamKeys.assignment, data)
  });
}

export type KeywordRuleInput = Pick<KeywordRule, 'keywords' | 'labelId' | 'assignUserId' | 'quickReplyId' | 'enabled'>;

export function useKeywordRules(enabled = true) {
  return useQuery({ queryKey: teamKeys.keywordRules, enabled, queryFn: () => api.get<KeywordRule[]>('/keyword-rules') });
}

export function useSaveKeywordRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: KeywordRuleInput }) =>
      id ? api.patch<KeywordRule>(`/keyword-rules/${id}`, input) : api.post<KeywordRule>('/keyword-rules', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: teamKeys.keywordRules })
  });
}

export function useDeleteKeywordRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/keyword-rules/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: teamKeys.keywordRules })
  });
}

/* ───────── Targets and progress ───────── */

export function useProgress(range: ProgressRange, enabled = true) {
  return useQuery({
    queryKey: teamKeys.progress(range),
    enabled,
    queryFn: () => api.get<ProgressResponse>('/reports/progress', { range })
  });
}

export function useTargets(enabled = true) {
  return useQuery({ queryKey: teamKeys.targets, enabled, queryFn: () => api.get<StaffTarget[]>('/targets') });
}

export function useSaveTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targets: StaffTarget[]) => api.put<StaffTarget[]>('/targets', { targets }),
    onSuccess: data => {
      qc.setQueryData(teamKeys.targets, data);
      void qc.invalidateQueries({ queryKey: ['progress'] });
      void qc.invalidateQueries({ queryKey: qk.staff });
    }
  });
}
