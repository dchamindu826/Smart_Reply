/**
 * Read models for the AI bot add-on, shared by the manager's read-only `/ai` routes and the
 * system admin's `/admin/.../ai` routes.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { formatPhone } from '@smart-reply/shared';
import type { AiAddon, AiBotLog, AiBotSettings, KnowledgeDocument, TrainingExample } from '@smart-reply/shared';
import type { DbOrTx } from '../../db/client';
import { aiAddonPlans, aiAddons, aiBotLogs, aiBotSettings, aiTrainingExamples, contacts, knowledgeDocuments, users } from '../../db/schema';

export type AiAddonRow = typeof aiAddons.$inferSelect;
export type AiSettingsRow = typeof aiBotSettings.$inferSelect;
export type AiLogRow = typeof aiBotLogs.$inferSelect;

/** `YYYY-MM` in UTC, the period the monthly reply limit counts in. */
export function usageMonth(at = new Date()): string {
  return at.toISOString().slice(0, 7);
}

/** Make sure a company has its add-on and settings rows (companies created before the add-on existed). */
export async function ensureAiRows(db: DbOrTx, companyId: string, defaultPrompt = ''): Promise<void> {
  await db.insert(aiAddons).values({ companyId }).onConflictDoNothing();
  await db.insert(aiBotSettings).values({ companyId, systemPrompt: defaultPrompt }).onConflictDoNothing();
}

async function namesOf(db: DbOrTx, ids: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (list.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return new Map(rows.map(r => [r.id, r.name]));
}

/** Add-on state for many companies at once. Missing rows read as `off`. */
export async function presentAddons(db: DbOrTx, companyIds: string[]): Promise<Map<string, AiAddon>> {
  const out = new Map<string, AiAddon>();
  if (companyIds.length === 0) return out;
  const rows = await db
    .select({ a: aiAddons, plan: aiAddonPlans })
    .from(aiAddons)
    .leftJoin(aiAddonPlans, eq(aiAddonPlans.id, aiAddons.addonPlanId))
    .where(inArray(aiAddons.companyId, companyIds));
  const names = await namesOf(db, rows.map(r => r.a.requestedBy));
  const month = usageMonth();
  for (const id of companyIds) {
    const r = rows.find(x => x.a.companyId === id);
    if (!r) {
      out.set(id, {
        status: 'off',
        planId: null,
        planName: null,
        activatedAt: null,
        activeUntil: null,
        monthlyReplyLimit: 0,
        repliesThisMonth: 0,
        tokensThisMonth: 0,
        costThisMonth: { amountMinor: 0, currency: 'LKR' },
        requestedAt: null,
        requestedByName: null
      });
      continue;
    }
    const { a, plan } = r;
    const current = a.usageMonth === month;
    const expired = a.status === 'active' && a.activeUntil !== null && a.activeUntil.getTime() <= Date.now();
    out.set(id, {
      status: expired ? 'expired' : a.status,
      planId: a.addonPlanId,
      planName: plan?.name ?? null,
      activatedAt: a.activatedAt?.toISOString() ?? null,
      activeUntil: a.activeUntil?.toISOString() ?? null,
      monthlyReplyLimit: a.monthlyReplyLimit,
      repliesThisMonth: current ? a.repliesThisMonth : 0,
      tokensThisMonth: current ? a.tokensThisMonth : 0,
      // The add-on is billed as the plan's monthly price; provider costs are LUMI AI's.
      costThisMonth: {
        amountMinor: (a.status === 'active' ? (plan?.priceMinor ?? 0) : 0) + (current ? a.costMinorThisMonth : 0),
        currency: plan?.currency ?? 'LKR'
      },
      requestedAt: a.requestedAt?.toISOString() ?? null,
      requestedByName: a.requestedBy ? (names.get(a.requestedBy) ?? null) : null
    });
  }
  return out;
}

export async function presentAddon(db: DbOrTx, companyId: string): Promise<AiAddon> {
  return (await presentAddons(db, [companyId])).get(companyId)!;
}

export function presentSettings(r: AiSettingsRow): AiBotSettings {
  return {
    chatBotEnabled: r.chatBotEnabled,
    voiceBotEnabled: r.voiceBotEnabled,
    chatBotMode: r.chatBotMode,
    personaName: r.personaName,
    languageMode: r.languageMode,
    systemPrompt: r.systemPrompt,
    confidenceThreshold: r.confidenceThreshold,
    autoHandoffOnNegotiation: r.autoHandoffOnNegotiation,
    autoHandoffOnComplaint: r.autoHandoffOnComplaint,
    autoHandoffOnStaffRequest: r.autoHandoffOnStaffRequest,
    welcomeMessage: r.welcomeMessage,
    fallbackMessage: r.fallbackMessage,
    voiceModel: r.voiceModel,
    voiceGreeting: r.voiceGreeting,
    autoTranscribeCalls: r.autoTranscribeCalls,
    autoSummarizeCalls: r.autoSummarizeCalls,
    missedCallAutoFollowup: r.missedCallAutoFollowup,
    missedCallMessageTemplate: r.missedCallMessageTemplate,
    voiceLanguage: r.voiceLanguage,
    voiceSpeed: r.voiceSpeed,
    model: r.model
  };
}

export async function loadSettings(db: DbOrTx, companyId: string): Promise<AiSettingsRow> {
  const [row] = await db.select().from(aiBotSettings).where(eq(aiBotSettings.companyId, companyId)).limit(1);
  if (row) return row;
  await ensureAiRows(db, companyId);
  const [created] = await db.select().from(aiBotSettings).where(eq(aiBotSettings.companyId, companyId)).limit(1);
  return created!;
}

/** Latest bot logs, newest first. `companyId` null means every company (system admin). */
export async function listLogs(db: DbOrTx, companyId: string | null, channel?: 'chat' | 'call', limit = 200): Promise<AiBotLog[]> {
  const where = and(companyId ? eq(aiBotLogs.companyId, companyId) : undefined, channel ? eq(aiBotLogs.channel, channel) : undefined);
  const rows = await db
    .select({ l: aiBotLogs, name: contacts.name, profileName: contacts.profileName, waId: contacts.waId })
    .from(aiBotLogs)
    .leftJoin(contacts, eq(contacts.id, aiBotLogs.contactId))
    .where(where)
    .orderBy(desc(aiBotLogs.createdAt))
    .limit(limit);
  const agents = await namesOf(db, rows.map(r => r.l.agentUserId));
  return rows.map(({ l, name, profileName, waId }) => ({
    id: l.id,
    channel: l.channel,
    contactName: name || profileName || (waId ? formatPhone(waId) : 'Customer'),
    contactPhone: waId ? formatPhone(waId) : '',
    timestamp: l.createdAt.toISOString(),
    intent: l.intent,
    confidence: l.confidence,
    userInput: l.userInput,
    botOutput: l.botOutput,
    status: l.status,
    agent: l.agentUserId ? (agents.get(l.agentUserId) ?? null) : null,
    tokensUsed: l.tokensUsed,
    latencyMs: l.latencyMs,
    callDuration: null
  }));
}

export async function listKnowledge(db: DbOrTx, companyId: string): Promise<KnowledgeDocument[]> {
  const rows = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.companyId, companyId)).orderBy(desc(knowledgeDocuments.createdAt));
  const names = await namesOf(db, rows.map(r => r.addedBy));
  return rows.map(r => presentKnowledge(r, names));
}

export function presentKnowledge(r: typeof knowledgeDocuments.$inferSelect, names: Map<string, string>): KnowledgeDocument {
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    status: r.status,
    characters: r.content.length,
    addedBy: r.addedBy ? (names.get(r.addedBy) ?? 'LUMI AI') : 'LUMI AI',
    createdAt: r.createdAt.toISOString()
  };
}

export async function listExamples(db: DbOrTx, companyId: string): Promise<TrainingExample[]> {
  const rows = await db.select().from(aiTrainingExamples).where(eq(aiTrainingExamples.companyId, companyId)).orderBy(desc(aiTrainingExamples.createdAt));
  const names = await namesOf(db, rows.map(r => r.approvedBy));
  return rows.map(r => presentExample(r, names));
}

export function presentExample(r: typeof aiTrainingExamples.$inferSelect, names: Map<string, string>): TrainingExample {
  return {
    id: r.id,
    question: r.question,
    idealAnswer: r.idealAnswer,
    approvedBy: r.approvedBy ? (names.get(r.approvedBy) ?? 'LUMI AI') : 'LUMI AI',
    createdAt: r.createdAt.toISOString()
  };
}

export { namesOf };
