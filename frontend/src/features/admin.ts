'use client';

/**
 * LUMI AI system admin console: every `/admin/*` call as a TanStack Query hook.
 * Only the `/admin` page uses these; the API checks `system_admin` on every route.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAiCompanyRow,
  AdminAuditEntry,
  AdminCompany,
  AdminCompanyCreated,
  AdminCompanyUser,
  AdminHealth,
  AdminUsageRow,
  AiAddon,
  AiAddonPlan,
  AiBotLog,
  AiBotSettings,
  AiSimulateResponse,
  ConnectLinkResponse,
  Invite,
  KnowledgeDocument,
  LoginResponse,
  Plan,
  PlatformAiSettings,
  PlatformMetaSettings,
  PlatformWebhookSettings,
  TrainingExample,
  WebhookEventRow,
  WhatsappAccountAdminView,
  WhatsappConnectResponse
} from '@smart-reply/shared';
import { api } from '@/lib/api';

/* ───────── Request bodies (mirror the zod schemas in packages/shared/src/schemas.ts) ───────── */

export interface CreateCompanyBody {
  name: string;
  slug?: string;
  planId: string | null;
  seatLimit?: number;
  timezone: string;
  manager: { name: string; email: string; phone?: string; password?: string };
}

export interface UpdateCompanyBody {
  name?: string;
  planId?: string | null;
  seatLimit?: number;
  timezone?: string;
  status?: AdminCompany['status'];
}

export interface AddManagerBody {
  name: string;
  email: string;
  phone?: string;
  password?: string;
}

export interface UpdateCompanyUserBody {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  role?: 'manager' | 'staff';
  status?: 'active' | 'disabled';
}

export interface PlanBody {
  name: string;
  seatLimit: number;
  priceMinor: number;
  currency: string;
  features: string[];
}

export interface PlatformMetaBody {
  appId: string;
  appSecret?: string;
  graphVersion: string;
  verifyToken?: string;
  embeddedSignupConfigId: string;
  systemToken?: string;
}

export interface PlatformWebhookBody {
  verifyToken?: string;
  subscribedFields?: string[];
}

export interface PlatformAiBody {
  provider: PlatformAiSettings['provider'];
  apiKey?: string;
  defaultModel: string;
  baseUrl: string;
  defaultPrompt: string;
  globalOff: boolean;
}

export interface AddonPlanBody {
  name: string;
  priceMinor: number;
  currency: string;
  monthlyReplyLimit: number;
  voiceIncluded: boolean;
}

export interface SetAddonBody {
  status: AiAddon['status'];
  planId: string | null;
  activeUntil: string | null;
  monthlyReplyLimit: number;
}

export interface KnowledgeBody {
  title: string;
  source: 'text' | 'upload' | 'catalog';
  text?: string;
  fileId?: string;
}

export interface SimulateTurn {
  role: 'user' | 'bot';
  text: string;
}

export interface EmbeddedConnectBody {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  pin?: string;
}

export interface ManualConnectBody {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  pin?: string;
}

export type WebhookEventStatus = 'all' | 'failed' | 'pending' | 'processed';

/* ───────── Query keys ───────── */

export const ak = {
  all: ['admin'] as const,
  health: ['admin', 'health'] as const,
  companies: ['admin', 'companies'] as const,
  company: (id: string) => ['admin', 'companies', id] as const,
  users: (id: string) => ['admin', 'companies', id, 'users'] as const,
  whatsapp: (id: string) => ['admin', 'companies', id, 'whatsapp'] as const,
  aiSettings: (id: string) => ['admin', 'companies', id, 'ai-settings'] as const,
  knowledge: (id: string) => ['admin', 'companies', id, 'knowledge'] as const,
  examples: (id: string) => ['admin', 'companies', id, 'examples'] as const,
  companyLogs: (id: string) => ['admin', 'companies', id, 'ai-logs'] as const,
  plans: ['admin', 'plans'] as const,
  meta: ['admin', 'platform', 'meta'] as const,
  webhook: ['admin', 'platform', 'webhook'] as const,
  events: (company: string, status: WebhookEventStatus) => ['admin', 'webhook-events', company, status] as const,
  eventsAll: ['admin', 'webhook-events'] as const,
  aiPlatform: ['admin', 'ai', 'platform'] as const,
  addonPlans: ['admin', 'ai', 'addon-plans'] as const,
  aiCompanies: ['admin', 'ai', 'companies'] as const,
  aiLogs: ['admin', 'ai', 'logs'] as const,
  usage: ['admin', 'usage'] as const,
  audit: ['admin', 'audit'] as const
};

/** After any write the audit log and the health/companies summaries may change. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: ReadonlyArray<readonly unknown[]>) =>
    Promise.all([
      ...keys.map(queryKey => qc.invalidateQueries({ queryKey })),
      qc.invalidateQueries({ queryKey: ak.audit })
    ]);
}

/* ───────── Overview / ops ───────── */

export function useAdminHealth() {
  return useQuery({ queryKey: ak.health, queryFn: () => api.get<AdminHealth>('/admin/health'), refetchInterval: 30_000 });
}

export function useAdminUsage() {
  return useQuery({ queryKey: ak.usage, queryFn: () => api.get<AdminUsageRow[]>('/admin/usage') });
}

export function useAdminAudit() {
  return useQuery({ queryKey: ak.audit, queryFn: () => api.get<AdminAuditEntry[]>('/admin/audit') });
}

/* ───────── Companies ───────── */

export function useAdminCompanies() {
  return useQuery({ queryKey: ak.companies, queryFn: () => api.get<AdminCompany[]>('/admin/companies') });
}

export function useAdminCompany(id: string) {
  return useQuery({ queryKey: ak.company(id), queryFn: () => api.get<AdminCompany>(`/admin/companies/${id}`), enabled: !!id });
}

export function useCompanyUsers(id: string) {
  return useQuery({ queryKey: ak.users(id), queryFn: () => api.get<AdminCompanyUser[]>(`/admin/companies/${id}/users`), enabled: !!id });
}

export function useCreateCompany() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateCompanyBody) => api.post<AdminCompanyCreated>('/admin/companies', body),
    onSuccess: () => inv(ak.companies, ak.health, ak.plans, ak.aiCompanies, ak.usage)
  });
}

export function useUpdateCompany(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: UpdateCompanyBody) => api.patch<AdminCompany>(`/admin/companies/${id}`, body),
    onSuccess: () => inv(ak.companies, ak.plans, ak.aiCompanies, ak.usage)
  });
}

export function useSetCompanyStatus(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (to: 'suspend' | 'activate') => api.post<AdminCompany>(`/admin/companies/${id}/${to}`),
    onSuccess: () => inv(ak.companies, ak.health)
  });
}

export function useAddManager(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: AddManagerBody) => api.post<Invite>(`/admin/companies/${id}/managers`, body),
    onSuccess: () => inv(ak.users(id), ak.companies)
  });
}

export function useUpdateCompanyUser(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateCompanyUserBody }) =>
      api.patch<AdminCompanyUser>(`/admin/companies/${id}/users/${userId}`, body),
    onSuccess: () => inv(ak.users(id), ak.companies)
  });
}

export function useImpersonate(id: string) {
  return useMutation({
    mutationFn: (reason: string) => api.post<LoginResponse>(`/admin/companies/${id}/impersonate`, { reason })
  });
}

/* ───────── WhatsApp ───────── */

export function useCompanyWhatsapp(id: string) {
  return useQuery({
    queryKey: ak.whatsapp(id),
    queryFn: () => api.get<WhatsappAccountAdminView>(`/admin/companies/${id}/whatsapp`),
    enabled: !!id
  });
}

function useWhatsappInvalidate(id: string) {
  const inv = useInvalidate();
  return () => inv(ak.whatsapp(id), ak.companies, ak.health);
}

export function useConnectEmbedded(id: string) {
  const done = useWhatsappInvalidate(id);
  return useMutation({
    mutationFn: (body: EmbeddedConnectBody) => api.post<WhatsappConnectResponse>(`/admin/companies/${id}/whatsapp/connect`, body),
    onSettled: done
  });
}

export function useConnectManual(id: string) {
  const done = useWhatsappInvalidate(id);
  return useMutation({
    mutationFn: (body: ManualConnectBody) => api.put<WhatsappConnectResponse>(`/admin/companies/${id}/whatsapp`, body),
    onSettled: done
  });
}

export function useWhatsappAction(id: string) {
  const done = useWhatsappInvalidate(id);
  return useMutation({
    mutationFn: (action: 'verify' | 'subscribe' | 'disconnect') =>
      api.post<WhatsappAccountAdminView>(`/admin/companies/${id}/whatsapp/${action}`),
    onSettled: done
  });
}

export function useConnectLink(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<ConnectLinkResponse>(`/admin/companies/${id}/whatsapp/connect-link`),
    onSuccess: () => inv()
  });
}

/* ───────── Plans ───────── */

export function usePlans() {
  return useQuery({ queryKey: ak.plans, queryFn: () => api.get<Plan[]>('/admin/plans') });
}

export function useSavePlan() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: PlanBody }) =>
      id ? api.patch<Plan>(`/admin/plans/${id}`, body) : api.post<Plan>('/admin/plans', body),
    onSuccess: () => inv(ak.plans, ak.companies)
  });
}

/* ───────── Platform: Meta + webhook ───────── */

export function usePlatformMeta() {
  return useQuery({ queryKey: ak.meta, queryFn: () => api.get<PlatformMetaSettings>('/admin/platform/meta') });
}

export function useSavePlatformMeta() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: PlatformMetaBody) => api.put<PlatformMetaSettings>('/admin/platform/meta', body),
    onSuccess: () => inv(ak.meta, ak.webhook)
  });
}

export function useTestMeta() {
  return useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>('/admin/platform/meta/test') });
}

export function usePlatformWebhook() {
  return useQuery({ queryKey: ak.webhook, queryFn: () => api.get<PlatformWebhookSettings>('/admin/platform/webhook') });
}

export function useSavePlatformWebhook() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: PlatformWebhookBody) => api.put<PlatformWebhookSettings>('/admin/platform/webhook', body),
    onSuccess: () => inv(ak.webhook, ak.meta)
  });
}

export function useTestWebhook() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; stored: number }>('/admin/platform/webhook/test'),
    onSuccess: () => inv(ak.eventsAll, ak.health)
  });
}

export function useWebhookEvents(company: string, status: WebhookEventStatus) {
  return useQuery({
    queryKey: ak.events(company, status),
    queryFn: () => api.get<WebhookEventRow[]>('/admin/webhook-events', { company: company || undefined, status, limit: 100 })
  });
}

export function useReplayEvent() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/admin/webhook-events/${id}/replay`),
    onSuccess: () => inv(ak.eventsAll, ak.health)
  });
}

/* ───────── AI platform ───────── */

export function usePlatformAi() {
  return useQuery({ queryKey: ak.aiPlatform, queryFn: () => api.get<PlatformAiSettings>('/admin/ai/platform') });
}

export function useSavePlatformAi() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: PlatformAiBody) => api.put<PlatformAiSettings>('/admin/ai/platform', body),
    onSuccess: () => inv(ak.aiPlatform)
  });
}

export function useAddonPlans() {
  return useQuery({ queryKey: ak.addonPlans, queryFn: () => api.get<AiAddonPlan[]>('/admin/ai/addon-plans') });
}

export function useSaveAddonPlan() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: AddonPlanBody }) =>
      id ? api.patch<AiAddonPlan>(`/admin/ai/addon-plans/${id}`, body) : api.post<AiAddonPlan>('/admin/ai/addon-plans', body),
    onSuccess: () => inv(ak.addonPlans, ak.aiCompanies)
  });
}

export function useAiCompanies() {
  return useQuery({ queryKey: ak.aiCompanies, queryFn: () => api.get<AdminAiCompanyRow[]>('/admin/ai/companies') });
}

export function useAllAiLogs() {
  return useQuery({ queryKey: ak.aiLogs, queryFn: () => api.get<AiBotLog[]>('/admin/ai/logs') });
}

/* ───────── AI bot of one company ───────── */

export function useSetAddon(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: SetAddonBody) => api.put<AiAddon>(`/admin/companies/${id}/ai/addon`, body),
    onSuccess: () => inv(ak.aiCompanies, ak.companies, ak.company(id))
  });
}

export function useCompanyAiSettings(id: string) {
  return useQuery({
    queryKey: ak.aiSettings(id),
    queryFn: () => api.get<AiBotSettings>(`/admin/companies/${id}/ai/settings`),
    enabled: !!id
  });
}

export function useSaveCompanyAiSettings(id: string) {
  const qc = useQueryClient();
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: AiBotSettings) => api.put<AiBotSettings>(`/admin/companies/${id}/ai/settings`, body),
    onSuccess: data => {
      qc.setQueryData(ak.aiSettings(id), data);
      return inv();
    }
  });
}

export function useKnowledge(id: string) {
  return useQuery({
    queryKey: ak.knowledge(id),
    queryFn: () => api.get<KnowledgeDocument[]>(`/admin/companies/${id}/ai/knowledge`),
    enabled: !!id
  });
}

export function useAddKnowledge(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: KnowledgeBody) => api.post<KnowledgeDocument>(`/admin/companies/${id}/ai/knowledge`, body),
    onSuccess: () => inv(ak.knowledge(id))
  });
}

export function useRemoveKnowledge(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => api.del(`/admin/companies/${id}/ai/knowledge/${docId}`),
    onSuccess: () => inv(ak.knowledge(id))
  });
}

export function useExamples(id: string) {
  return useQuery({
    queryKey: ak.examples(id),
    queryFn: () => api.get<TrainingExample[]>(`/admin/companies/${id}/ai/examples`),
    enabled: !!id
  });
}

export function useAddExample(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { question: string; idealAnswer: string }) => api.post<TrainingExample>(`/admin/companies/${id}/ai/examples`, body),
    onSuccess: () => inv(ak.examples(id))
  });
}

export function useExampleFromLog(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ logId, idealAnswer }: { logId: string; idealAnswer: string }) =>
      api.post<TrainingExample>(`/admin/companies/${id}/ai/examples/from-log/${logId}`, { idealAnswer }),
    onSuccess: () => inv(ak.examples(id))
  });
}

export function useRemoveExample(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (exampleId: string) => api.del(`/admin/companies/${id}/ai/examples/${exampleId}`),
    onSuccess: () => inv(ak.examples(id))
  });
}

export function useSimulate(id: string) {
  return useMutation({
    mutationFn: (body: { message: string; history: SimulateTurn[] }) =>
      api.post<AiSimulateResponse>(`/admin/companies/${id}/ai/simulate`, body)
  });
}

export function useCompanyAiLogs(id: string) {
  return useQuery({
    queryKey: ak.companyLogs(id),
    queryFn: () => api.get<AiBotLog[]>(`/admin/companies/${id}/ai/logs`),
    enabled: !!id
  });
}
