import { Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AiAddon, AiBotLog, AiBotSettingsSummary, aiSettingsSchema, aiSwitchSchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import type { CompanySession } from '../../common/session';
import type { Db } from '../../db/client';
import { aiAddons, aiBotSettings, aiTrainingExamples, companies, knowledgeDocuments } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Realtime, rooms } from '../../infra/realtime';
import { ensureAiRows, listLogs, loadSettings, presentAddon, presentSettings } from './ai.presenters';

/** What a manager may do with the AI bot: look, and ask LUMI AI to activate it. Nothing else. */
@Injectable()
export class AiService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: Audit,
    private readonly realtime: Realtime
  ) {}

  status(s: CompanySession): Promise<AiAddon> {
    return presentAddon(this.db, s.companyId);
  }

  async settings(s: CompanySession): Promise<AiBotSettingsSummary> {
    const row = await loadSettings(this.db, s.companyId);
    const settings = presentSettings(row);
    const [[docs], [examples]] = await Promise.all([
      this.db.select({ n: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.companyId, s.companyId)),
      this.db.select({ n: count() }).from(aiTrainingExamples).where(eq(aiTrainingExamples.companyId, s.companyId))
    ]);
    return { ...settings, knowledgeDocuments: Number(docs?.n ?? 0), trainingExamples: Number(examples?.n ?? 0) };
  }

  async saveSettings(s: CompanySession, input: z.infer<typeof aiSettingsSchema>): Promise<AiBotSettingsSummary> {
    await ensureAiRows(this.db, s.companyId);
    await this.db
      .update(aiBotSettings)
      .set({ ...input, updatedBy: s.userId })
      .where(eq(aiBotSettings.companyId, s.companyId));
    await this.audit.log(s, {
      action: 'ai.settings_updated',
      targetType: 'ai_settings',
      targetId: s.companyId,
      summary: `${s.name} updated AI bot settings (chat: ${input.chatBotEnabled ? 'on' : 'off'}, voice: ${input.voiceBotEnabled ? 'on' : 'off'})`
    });
    return this.settings(s);
  }

  async switchBots(s: CompanySession, input: z.infer<typeof aiSwitchSchema>): Promise<AiBotSettingsSummary> {
    await ensureAiRows(this.db, s.companyId);
    const set: Partial<typeof aiBotSettings.$inferInsert> = { updatedBy: s.userId };
    if (input.chatBotEnabled !== undefined) set.chatBotEnabled = input.chatBotEnabled;
    if (input.voiceBotEnabled !== undefined) set.voiceBotEnabled = input.voiceBotEnabled;
    await this.db.update(aiBotSettings).set(set).where(eq(aiBotSettings.companyId, s.companyId));
    const parts = [
      input.chatBotEnabled !== undefined ? `chat bot ${input.chatBotEnabled ? 'on' : 'off'}` : null,
      input.voiceBotEnabled !== undefined ? `voice agent ${input.voiceBotEnabled ? 'on' : 'off'}` : null
    ].filter(Boolean);
    await this.audit.log(s, {
      action: 'ai.settings_updated',
      targetType: 'ai_settings',
      targetId: s.companyId,
      summary: `${s.name} turned the ${parts.join(' and ')} from the app`
    });
    return this.settings(s);
  }

  logs(s: CompanySession, channel?: 'chat' | 'call'): Promise<AiBotLog[]> {
    return listLogs(this.db, s.companyId, channel);
  }

  async requestActivation(s: CompanySession, message: string): Promise<AiAddon> {
    await ensureAiRows(this.db, s.companyId);
    await this.db
      .update(aiAddons)
      .set({ requestedAt: new Date(), requestedBy: s.userId, requestMessage: message })
      .where(eq(aiAddons.companyId, s.companyId));
    const [c] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, s.companyId)).limit(1);
    this.realtime.emit([rooms.admins()], 'notice', {
      text: `${c?.name ?? 'A company'} asked LUMI AI to activate the AI bot add-on.`,
      level: 'info'
    });
    await this.audit.log(s, {
      action: 'ai.activation_requested',
      targetType: 'ai_addon',
      targetId: s.companyId,
      summary: `${s.name} asked LUMI AI to activate the AI bot`
    });
    return presentAddon(this.db, s.companyId);
  }
}
