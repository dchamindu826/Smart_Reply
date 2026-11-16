import { Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import type { AiAddon, AiBotLog, AiBotSettingsSummary } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import type { CompanySession } from '../../common/session';
import type { Db } from '../../db/client';
import { aiAddons, aiTrainingExamples, companies, knowledgeDocuments } from '../../db/schema';
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
    const { systemPrompt, ...rest } = presentSettings(row);
    void systemPrompt;
    const [[docs], [examples]] = await Promise.all([
      this.db.select({ n: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.companyId, s.companyId)),
      this.db.select({ n: count() }).from(aiTrainingExamples).where(eq(aiTrainingExamples.companyId, s.companyId))
    ]);
    return { ...rest, knowledgeDocuments: Number(docs?.n ?? 0), trainingExamples: Number(examples?.n ?? 0) };
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
