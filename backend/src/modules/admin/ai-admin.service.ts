/** The system admin's control of a company's AI bot: add-on, settings, training and the simulator. */
import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { formatMoney } from '@smart-reply/shared';
import type {
  AdminAiCompanyRow,
  AiAddon,
  AiBotLog,
  AiBotSettings,
  AiSimulateResponse,
  KnowledgeDocument,
  TrainingExample,
  aiSettingsSchema,
  knowledgeSchema,
  setAiAddonSchema
} from '@smart-reply/shared';
import { AppError, notFound } from '../../common/errors';
import type { Session } from '../../common/session';
import type { Db } from '../../db/client';
import { aiAddonPlans, aiAddons, aiBotLogs, aiBotSettings, aiTrainingExamples, companies, files, knowledgeDocuments, productCollections, products } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Realtime, rooms } from '../../infra/realtime';
import { Storage } from '../../infra/storage';
import { Platform } from '../../meta/platform';
import { AiEngine } from '../ai/ai.engine';
import { ensureAiRows, listExamples, listKnowledge, listLogs, loadSettings, namesOf, presentAddon, presentAddons, presentExample, presentKnowledge, presentSettings } from '../ai/ai.presenters';
import { AdminAudit } from './admin.audit';
import { CompaniesService, assertUuid } from './companies.service';
import { KNOWLEDGE_MAX_CHARS, extractText } from './knowledge-extract';

const STATUS_TEXT: Record<AiAddon['status'], string> = {
  active: 'LUMI AI activated the AI bot add-on for your company.',
  paused: 'LUMI AI paused the AI bot add-on.',
  expired: 'The AI bot add-on has expired. Ask LUMI AI to renew it.',
  off: 'LUMI AI turned the AI bot add-on off.'
};

@Injectable()
export class AiAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly companies: CompaniesService,
    private readonly audit: AdminAudit,
    private readonly realtime: Realtime,
    private readonly platform: Platform,
    private readonly storage: Storage,
    private readonly engine: AiEngine
  ) {}

  private async prepare(companyId: string) {
    const c = await this.companies.require(companyId);
    await ensureAiRows(this.db, companyId, (await this.platform.get()).ai.defaultPrompt);
    return c;
  }

  async companiesList(): Promise<AdminAiCompanyRow[]> {
    const rows = await this.db
      .select({ id: companies.id, name: companies.name, requestedAt: aiAddons.requestedAt })
      .from(companies)
      .leftJoin(aiAddons, eq(aiAddons.companyId, companies.id))
      .orderBy(asc(companies.name));
    const addons = await presentAddons(this.db, rows.map(r => r.id));
    const list = rows.map(r => ({ companyId: r.id, companyName: r.name, addon: addons.get(r.id)! }));
    // Pending activation requests first, oldest request first.
    return list.sort((a, b) => {
      const ra = a.addon.requestedAt;
      const rb = b.addon.requestedAt;
      if (ra && !rb) return -1;
      if (!ra && rb) return 1;
      if (ra && rb) return ra.localeCompare(rb);
      return a.companyName.localeCompare(b.companyName);
    });
  }

  async setAddon(s: Session, companyId: string, input: z.infer<typeof setAiAddonSchema>): Promise<AiAddon> {
    const c = await this.prepare(companyId);
    if (input.planId) {
      const [plan] = await this.db.select({ id: aiAddonPlans.id }).from(aiAddonPlans).where(eq(aiAddonPlans.id, input.planId)).limit(1);
      if (!plan) throw notFound('AI add-on plan');
    }
    const [before] = await this.db.select().from(aiAddons).where(eq(aiAddons.companyId, companyId)).limit(1);
    await this.db
      .update(aiAddons)
      .set({
        status: input.status,
        addonPlanId: input.planId,
        activeUntil: input.activeUntil ? new Date(input.activeUntil) : null,
        monthlyReplyLimit: input.monthlyReplyLimit,
        ...(input.status === 'active'
          ? {
              activatedAt: before?.status === 'active' && before.activatedAt ? before.activatedAt : new Date(),
              activatedBy: s.userId,
              requestedAt: null,
              requestedBy: null,
              requestMessage: ''
            }
          : {})
      })
      .where(eq(aiAddons.companyId, companyId));
    if (before?.status !== input.status) {
      this.realtime.emit([rooms.managers(companyId)], 'notice', { text: STATUS_TEXT[input.status], level: input.status === 'active' ? 'info' : 'warn' });
    }
    await this.audit.log(s, companyId, {
      action: 'ai.addon_updated',
      targetType: 'ai_addon',
      targetId: companyId,
      summary: `AI add-on for ${c.name}: ${input.status}, ${input.monthlyReplyLimit} replies a month${input.activeUntil ? `, until ${input.activeUntil.slice(0, 10)}` : ''}`
    });
    return presentAddon(this.db, companyId);
  }

  async settings(companyId: string): Promise<AiBotSettings> {
    await this.prepare(companyId);
    return presentSettings(await loadSettings(this.db, companyId));
  }

  async saveSettings(s: Session, companyId: string, input: z.infer<typeof aiSettingsSchema>): Promise<AiBotSettings> {
    const c = await this.prepare(companyId);
    await this.db.update(aiBotSettings).set({ ...input, updatedBy: s.userId }).where(eq(aiBotSettings.companyId, companyId));
    await this.audit.log(s, companyId, {
      action: 'ai.settings_updated',
      targetType: 'ai_settings',
      targetId: companyId,
      summary: `AI bot settings changed for ${c.name} (chat bot ${input.chatBotEnabled ? 'on' : 'off'}, mode ${input.chatBotMode}, threshold ${input.confidenceThreshold})`
    });
    return this.settings(companyId);
  }

  /* ───────── Knowledge ───────── */

  async knowledge(companyId: string): Promise<KnowledgeDocument[]> {
    await this.companies.require(companyId);
    return listKnowledge(this.db, companyId);
  }

  private async catalogText(companyId: string): Promise<string> {
    const rows = await this.db
      .select({ p: products, collection: productCollections.name })
      .from(products)
      .leftJoin(productCollections, eq(productCollections.id, products.collectionId))
      .where(and(eq(products.companyId, companyId), eq(products.status, 'active')))
      .orderBy(asc(productCollections.position), asc(products.name));
    const groups = new Map<string, string[]>();
    for (const { p, collection } of rows) {
      const key = collection ?? 'Other products';
      const unit = p.priceUnit ? ` / ${p.priceUnit}` : '';
      const old = p.oldPriceMinor ? ` (was ${formatMoney(p.oldPriceMinor, p.currency)})` : '';
      const line = `- ${p.name}${p.sku ? ` [${p.sku}]` : ''}: ${formatMoney(p.priceMinor, p.currency)}${unit}${old}${p.note ? ` — ${p.note}` : ''}`;
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return [...groups.entries()]
      .map(([g, lines]) => `${g}\n${lines.join('\n')}`)
      .join('\n\n')
      .slice(0, KNOWLEDGE_MAX_CHARS);
  }

  async addKnowledge(s: Session, companyId: string, input: z.infer<typeof knowledgeSchema>): Promise<KnowledgeDocument> {
    await this.prepare(companyId);
    let title = input.title;
    let content = '';
    let status: 'ready' | 'failed' = 'ready';
    let fileId: string | null = null;
    if (input.source === 'text') {
      if (!input.text?.trim()) throw new AppError('VALIDATION_FAILED', 'text: Paste the text the bot should learn.');
      content = input.text.trim();
    } else if (input.source === 'upload') {
      if (!input.fileId) throw new AppError('VALIDATION_FAILED', 'fileId: Upload a file first.');
      const [f] = await this.db
        .select()
        .from(files)
        .where(and(eq(files.id, input.fileId), or(eq(files.companyId, companyId), isNull(files.companyId))))
        .limit(1);
      if (!f) throw notFound('File');
      if (!f.uploaded && (await this.storage.size(f.storageKey)) === null) throw new AppError('BAD_REQUEST', `“${f.name}” has not finished uploading.`);
      fileId = f.id;
      const result = extractText(f.mime, await this.storage.get(f.storageKey));
      if (result.ok) content = result.text.trim();
      else {
        status = 'failed';
        title = `${input.title} (${result.reason})`.slice(0, 200);
      }
      if (result.ok && !content) {
        status = 'failed';
        title = `${input.title} (no text found — paste the text instead)`.slice(0, 200);
      }
    } else {
      content = await this.catalogText(companyId);
      if (!content) throw new AppError('BAD_REQUEST', 'This company has no active products in its catalog yet.');
    }
    const [row] = await this.db
      .insert(knowledgeDocuments)
      .values({ companyId, title, source: input.source, content, fileId, status, addedBy: s.userId })
      .returning();
    await this.audit.log(s, companyId, {
      action: 'ai.knowledge_added',
      targetType: 'knowledge_document',
      targetId: row.id,
      summary: `Added AI knowledge “${input.title}” (${input.source}, ${content.length} characters${status === 'failed' ? ', failed' : ''})`
    });
    return presentKnowledge(row, await namesOf(this.db, [s.userId]));
  }

  async removeKnowledge(s: Session, companyId: string, docId: string): Promise<void> {
    await this.companies.require(companyId);
    assertUuid(docId, 'Document');
    const [row] = await this.db
      .delete(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.id, docId), eq(knowledgeDocuments.companyId, companyId)))
      .returning({ id: knowledgeDocuments.id, title: knowledgeDocuments.title });
    if (!row) throw notFound('Document');
    await this.audit.log(s, companyId, { action: 'ai.knowledge_removed', targetType: 'knowledge_document', targetId: row.id, summary: `Removed AI knowledge “${row.title}”` });
  }

  /* ───────── Training examples ───────── */

  async examples(companyId: string): Promise<TrainingExample[]> {
    await this.companies.require(companyId);
    return listExamples(this.db, companyId);
  }

  async addExample(s: Session, companyId: string, input: { question: string; idealAnswer: string }, sourceMessageId: string | null = null): Promise<TrainingExample> {
    await this.companies.require(companyId);
    const [row] = await this.db
      .insert(aiTrainingExamples)
      .values({ companyId, question: input.question, idealAnswer: input.idealAnswer, sourceMessageId, approvedBy: s.userId })
      .returning();
    await this.audit.log(s, companyId, { action: 'ai.example_added', targetType: 'training_example', targetId: row.id, summary: 'Added an AI training example' });
    return presentExample(row, await namesOf(this.db, [s.userId]));
  }

  async exampleFromLog(s: Session, companyId: string, logId: string, idealAnswer: string): Promise<TrainingExample> {
    await this.companies.require(companyId);
    assertUuid(logId, 'Bot log');
    const [log] = await this.db
      .select()
      .from(aiBotLogs)
      .where(and(eq(aiBotLogs.id, logId), eq(aiBotLogs.companyId, companyId)))
      .limit(1);
    if (!log) throw notFound('Bot log');
    if (!log.userInput.trim()) throw new AppError('BAD_REQUEST', 'This log has no customer message to learn from.');
    return this.addExample(s, companyId, { question: log.userInput.slice(0, 2000), idealAnswer }, log.messageId);
  }

  async removeExample(s: Session, companyId: string, exampleId: string): Promise<void> {
    await this.companies.require(companyId);
    assertUuid(exampleId, 'Example');
    const [row] = await this.db
      .delete(aiTrainingExamples)
      .where(and(eq(aiTrainingExamples.id, exampleId), eq(aiTrainingExamples.companyId, companyId)))
      .returning({ id: aiTrainingExamples.id });
    if (!row) throw notFound('Example');
    await this.audit.log(s, companyId, { action: 'ai.example_removed', targetType: 'training_example', targetId: row.id, summary: 'Removed an AI training example' });
  }

  /* ───────── Simulator and logs ───────── */

  async simulate(companyId: string, message: string, history: { role: 'user' | 'bot'; text: string }[]): Promise<AiSimulateResponse> {
    await this.prepare(companyId);
    return this.engine.simulate(companyId, message, history);
  }

  async logs(companyId: string | null): Promise<AiBotLog[]> {
    if (companyId) await this.companies.require(companyId);
    return listLogs(this.db, companyId);
  }
}
