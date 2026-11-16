import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Broadcast, broadcastSchema, templateVariableCount } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import type { Db } from '../../db/client';
import { broadcastRecipients, broadcasts, contacts, labels, templates } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Queues } from '../../infra/queues';
import { WhatsappAccounts } from '../../meta/platform';
import { BroadcastRow, BroadcastRunner, audienceWhere } from './broadcast.runner';

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly runner: BroadcastRunner,
    private readonly queues: Queues,
    private readonly whatsapp: WhatsappAccounts,
    private readonly audit: Audit
  ) {}

  private async audience(companyId: string, labelId: string | null): Promise<number> {
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(audienceWhere(companyId, labelId));
    return r?.n ?? 0;
  }

  private async present(rows: BroadcastRow[]): Promise<Broadcast[]> {
    if (!rows.length) return [];
    const companyId = rows[0].companyId;
    const labelIds = [...new Set(rows.map(r => r.labelId).filter((x): x is string => Boolean(x)))];
    const lbls = labelIds.length ? await this.db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, labelIds)) : [];
    const labelName = new Map(lbls.map(l => [l.id, l.name]));
    const tpls = await this.db
      .select({ id: templates.id, name: templates.name })
      .from(templates)
      .where(inArray(templates.id, [...new Set(rows.map(r => r.templateId))]));
    const tplName = new Map(tpls.map(t => [t.id, t.name]));
    const counts = await this.runner.counts(rows.map(r => r.id));
    const audienceBy = new Map<string, number>();
    return Promise.all(
      rows.map(async r => {
        const c = counts.get(r.id);
        let audience = c?.audience ?? 0;
        if (!c && (r.status === 'draft' || r.status === 'scheduled')) {
          const key = r.labelId ?? '';
          if (!audienceBy.has(key)) audienceBy.set(key, await this.audience(companyId, r.labelId));
          audience = audienceBy.get(key) ?? 0;
        }
        return {
          id: r.id,
          name: r.name,
          labelId: r.labelId,
          labelName: r.labelId ? (labelName.get(r.labelId) ?? '') : 'All opted-in customers',
          templateId: r.templateId,
          templateName: tplName.get(r.templateId) ?? '',
          status: r.status,
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          audience,
          sent: c?.sent ?? 0,
          delivered: c?.delivered ?? 0,
          read: c?.read ?? 0,
          replied: c?.replied ?? 0,
          failed: c?.failed ?? 0,
          createdAt: r.createdAt.toISOString()
        };
      })
    );
  }

  async list(s: CompanySession): Promise<Broadcast[]> {
    const rows = await this.db.select().from(broadcasts).where(eq(broadcasts.companyId, s.companyId)).orderBy(desc(broadcasts.createdAt));
    return this.present(rows);
  }

  async get(s: CompanySession, id: string): Promise<Broadcast> {
    return (await this.present([await findOwned(this.db, broadcasts, s.companyId, id, 'Broadcast')]))[0];
  }

  async create(s: CompanySession, input: z.infer<typeof broadcastSchema>): Promise<Broadcast> {
    const tpl = await findOwned(this.db, templates, s.companyId, input.templateId, 'Template');
    if (tpl.status !== 'approved') throw new AppError('TEMPLATE_NOT_APPROVED', `Template “${tpl.name}” is not approved by Meta yet.`);
    if (tpl.category !== 'marketing' && tpl.category !== 'utility') {
      throw new AppError('BAD_REQUEST', 'Broadcasts can use marketing or utility templates only.');
    }
    const needed = templateVariableCount(tpl.body);
    if (input.variables.filter(v => v.length > 0).length < needed) {
      throw new AppError('VALIDATION_FAILED', `Template “${tpl.name}” needs ${needed} variable${needed === 1 ? '' : 's'}.`);
    }
    if (input.labelId) await findOwned(this.db, labels, s.companyId, input.labelId, 'Label');
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Pick a time in the future, or send now.');
    if (scheduledAt) await this.whatsapp.require(s.companyId);

    const [row] = await this.db
      .insert(broadcasts)
      .values({
        companyId: s.companyId,
        name: input.name,
        labelId: input.labelId,
        templateId: tpl.id,
        variables: input.variables,
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduledAt,
        createdBy: s.userId
      })
      .returning();
    if (scheduledAt) {
      await this.queues.add('broadcast.run', { broadcastId: row.id }, { jobId: `bc-${row.id}`, delay: scheduledAt.getTime() - Date.now() });
    }
    await this.audit.log(s, {
      action: scheduledAt ? 'broadcast.schedule' : 'broadcast.create',
      targetType: 'broadcast',
      targetId: row.id,
      summary: scheduledAt ? `Scheduled broadcast “${row.name}” for ${scheduledAt.toISOString()}` : `Created broadcast draft “${row.name}”`
    });
    return this.get(s, row.id);
  }

  async send(s: CompanySession, id: string): Promise<Broadcast> {
    const b = await findOwned(this.db, broadcasts, s.companyId, id, 'Broadcast');
    if (b.status !== 'draft' && b.status !== 'scheduled') throw new AppError('CONFLICT', 'This broadcast has already been sent or cancelled.');
    await this.whatsapp.require(s.companyId);
    const [tpl] = await this.db.select().from(templates).where(eq(templates.id, b.templateId)).limit(1);
    if (!tpl || tpl.status !== 'approved') throw new AppError('TEMPLATE_NOT_APPROVED', 'The template of this broadcast is no longer approved.');

    if (b.status === 'draft' && b.scheduledAt && b.scheduledAt.getTime() > Date.now()) {
      await this.db.update(broadcasts).set({ status: 'scheduled' }).where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, 'draft')));
      await this.queues.add('broadcast.run', { broadcastId: b.id }, { jobId: `bc-${b.id}`, delay: b.scheduledAt.getTime() - Date.now() });
      await this.audit.log(s, { action: 'broadcast.schedule', targetType: 'broadcast', targetId: b.id, summary: `Scheduled broadcast “${b.name}”` });
      return this.get(s, b.id);
    }

    const audience = await this.db.transaction(async tx => {
      const [u] = await tx
        .update(broadcasts)
        .set({ status: 'sending', startedAt: new Date() })
        .where(and(eq(broadcasts.id, b.id), inArray(broadcasts.status, ['draft', 'scheduled'])))
        .returning();
      if (!u) throw new AppError('CONFLICT', 'This broadcast has already been sent or cancelled.');
      return this.runner.snapshot(b, tx);
    });
    // A scheduled broadcast already has a delayed job named bc-<id>; this one starts now.
    await this.queues.add('broadcast.run', { broadcastId: b.id }, { jobId: b.status === 'scheduled' ? `bc-${b.id}-now` : `bc-${b.id}` });
    await this.audit.log(s, { action: 'broadcast.send', targetType: 'broadcast', targetId: b.id, summary: `Started broadcast “${b.name}” to ${audience} customers` });
    return this.get(s, b.id);
  }

  async cancel(s: CompanySession, id: string): Promise<Broadcast> {
    const b = await findOwned(this.db, broadcasts, s.companyId, id, 'Broadcast');
    const [u] = await this.db
      .update(broadcasts)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(and(eq(broadcasts.id, b.id), inArray(broadcasts.status, ['draft', 'scheduled', 'sending'])))
      .returning();
    if (!u) throw new AppError('CONFLICT', 'This broadcast has already finished.');
    await this.db
      .update(broadcastRecipients)
      .set({ status: 'skipped' })
      .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending')));
    await this.audit.log(s, { action: 'broadcast.cancel', targetType: 'broadcast', targetId: b.id, summary: `Cancelled broadcast “${b.name}”` });
    return this.get(s, b.id);
  }
}
