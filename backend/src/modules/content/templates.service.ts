import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { CreateTemplateInput, Template } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import type { Db } from '../../db/client';
import { broadcasts, templates } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { GraphError, toAppError } from '../../meta/graph';
import { WhatsappAccounts } from '../../meta/platform';
import { TemplateRow, TemplateStatus, buildCreateBody, categoryFromMeta, presentTemplate, statusFromMeta } from './template-meta';
import { TemplateSync } from './template-sync';
import { isUniqueViolation } from './util';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly whatsapp: WhatsappAccounts,
    private readonly sync: TemplateSync,
    private readonly audit: Audit
  ) {}

  async list(s: CompanySession, status?: TemplateStatus): Promise<Template[]> {
    const rows = await this.db
      .select()
      .from(templates)
      .where(and(eq(templates.companyId, s.companyId), status ? eq(templates.status, status) : undefined))
      .orderBy(asc(templates.name), asc(templates.language));
    return rows.map(presentTemplate);
  }

  async get(s: CompanySession, id: string): Promise<Template> {
    return presentTemplate(await findOwned(this.db, templates, s.companyId, id, 'Template'));
  }

  private inputOf(r: TemplateRow): CreateTemplateInput {
    return {
      name: r.name,
      category: r.category,
      language: r.language,
      headerText: r.headerText,
      body: r.body,
      footer: r.footer,
      buttons: r.buttons,
      examples: []
    };
  }

  /** Submit to Meta; returns Meta's id, status and (possibly corrected) category. */
  private async submit(companyId: string, input: CreateTemplateInput): Promise<Pick<TemplateRow, 'metaTemplateId' | 'status' | 'category'>> {
    const wa = await this.whatsapp.require(companyId);
    try {
      const res = await wa.graph.createTemplate(wa.wabaId, buildCreateBody(input));
      return {
        metaTemplateId: res.id,
        status: statusFromMeta(res.status) ?? 'pending',
        category: categoryFromMeta(res.category) ?? input.category
      };
    } catch (err) {
      throw toAppError(err);
    }
  }

  async create(s: CompanySession, input: CreateTemplateInput): Promise<Template> {
    const [dup] = await this.db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.companyId, s.companyId), eq(templates.name, input.name), eq(templates.language, input.language)))
      .limit(1);
    if (dup) throw new AppError('CONFLICT', `A template called “${input.name}” already exists in this language.`);
    const meta = await this.submit(s.companyId, input);
    let row: TemplateRow;
    try {
      [row] = await this.db
        .insert(templates)
        .values({
          companyId: s.companyId,
          name: input.name,
          language: input.language,
          headerText: input.headerText,
          body: input.body,
          footer: input.footer,
          buttons: input.buttons,
          submittedBy: s.userId,
          ...meta
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', `A template called “${input.name}” already exists in this language.`);
      throw err;
    }
    await this.audit.log(s, {
      action: 'template.create',
      targetType: 'template',
      targetId: row.id,
      summary: `Submitted template “${row.name}” (${row.language}, ${row.category}) to Meta`
    });
    return presentTemplate(row);
  }

  async resubmit(s: CompanySession, id: string): Promise<Template> {
    const row = await findOwned(this.db, templates, s.companyId, id, 'Template');
    if (row.status !== 'rejected' && row.status !== 'paused') {
      throw new AppError('CONFLICT', 'Only rejected or paused templates can be submitted again.');
    }
    const wa = await this.whatsapp.require(s.companyId);
    try {
      await wa.graph.deleteTemplate(wa.wabaId, row.name, row.metaTemplateId);
    } catch (err) {
      if (!(err instanceof GraphError && err.status === 404)) throw toAppError(err);
    }
    const meta = await this.submit(s.companyId, this.inputOf(row));
    const [u] = await this.db
      .update(templates)
      .set({ ...meta, rejectionReason: null, quality: 'unknown', submittedBy: s.userId })
      .where(eq(templates.id, row.id))
      .returning();
    await this.audit.log(s, {
      action: 'template.resubmit',
      targetType: 'template',
      targetId: row.id,
      summary: `Submitted template “${row.name}” (${row.language}) to Meta again`
    });
    return presentTemplate(u);
  }

  async remove(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, templates, s.companyId, id, 'Template');
    const wa = await this.whatsapp.require(s.companyId);
    try {
      await wa.graph.deleteTemplate(wa.wabaId, row.name, row.metaTemplateId);
    } catch (err) {
      if (!(err instanceof GraphError && err.status === 404)) throw toAppError(err);
    }
    const [used] = await this.db.select({ id: broadcasts.id }).from(broadcasts).where(eq(broadcasts.templateId, row.id)).limit(1);
    if (used) await this.db.update(templates).set({ status: 'disabled' }).where(eq(templates.id, row.id));
    else await this.db.delete(templates).where(eq(templates.id, row.id));
    await this.audit.log(s, {
      action: 'template.delete',
      targetType: 'template',
      targetId: row.id,
      summary: `Deleted template “${row.name}” (${row.language})`
    });
    return { ok: true };
  }

  async syncNow(s: CompanySession): Promise<{ updated: number }> {
    await this.whatsapp.require(s.companyId);
    const res = await this.sync.syncCompany(s.companyId);
    await this.audit.log(s, { action: 'template.sync', targetType: 'template', summary: `Synced templates from Meta (${res.updated} updated)` });
    return res;
  }
}
