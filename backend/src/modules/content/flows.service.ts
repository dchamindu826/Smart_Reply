import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Flow, flowSchema, updateFlowSchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import type { Db } from '../../db/client';
import { flows, quickReplies } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { defined } from './util';

type FlowRow = typeof flows.$inferSelect;
type FlowInput = z.infer<typeof flowSchema>;

function present(r: FlowRow): Flow {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    enabled: r.enabled,
    keywords: r.keywords,
    replyText: r.replyText,
    quickReplyId: r.quickReplyId,
    onlyOutsideHours: r.onlyOutsideHours,
    matchCount: r.matchCount
  };
}

@Injectable()
export class FlowsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: Audit
  ) {}

  private async check(s: CompanySession, f: FlowInput): Promise<void> {
    if (f.kind === 'keyword' && f.keywords.length === 0) throw new AppError('VALIDATION_FAILED', 'Add at least one keyword.');
    if (!f.replyText && !f.quickReplyId) throw new AppError('VALIDATION_FAILED', 'Write a reply or choose a quick reply.');
    if (f.quickReplyId) await findOwned(this.db, quickReplies, s.companyId, f.quickReplyId, 'Quick reply');
  }

  private normalize<T extends { keywords?: string[] }>(f: T): T {
    return f.keywords ? { ...f, keywords: [...new Set(f.keywords.map(k => k.toLowerCase()))] } : f;
  }

  async list(s: CompanySession): Promise<Flow[]> {
    const rows = await this.db.select().from(flows).where(eq(flows.companyId, s.companyId)).orderBy(asc(flows.kind), asc(flows.name));
    return rows.map(present);
  }

  async get(s: CompanySession, id: string): Promise<Flow> {
    return present(await findOwned(this.db, flows, s.companyId, id, 'Flow'));
  }

  async create(s: CompanySession, input: FlowInput): Promise<Flow> {
    const f = this.normalize(input);
    await this.check(s, f);
    const [row] = await this.db.insert(flows).values({ companyId: s.companyId, ...f }).returning();
    await this.audit.log(s, { action: 'flow.create', targetType: 'flow', targetId: row.id, summary: `Added ${row.kind} flow “${row.name}”` });
    return present(row);
  }

  async update(s: CompanySession, id: string, input: z.infer<typeof updateFlowSchema>): Promise<Flow> {
    const row = await findOwned(this.db, flows, s.companyId, id, 'Flow');
    const patch = this.normalize(defined(input));
    const merged: FlowInput = {
      name: patch.name ?? row.name,
      kind: patch.kind ?? row.kind,
      enabled: patch.enabled ?? row.enabled,
      keywords: patch.keywords ?? row.keywords,
      replyText: patch.replyText ?? row.replyText,
      quickReplyId: patch.quickReplyId !== undefined ? patch.quickReplyId : row.quickReplyId,
      onlyOutsideHours: patch.onlyOutsideHours ?? row.onlyOutsideHours
    };
    await this.check(s, merged);
    const [u] = await this.db.update(flows).set(merged).where(eq(flows.id, row.id)).returning();
    await this.audit.log(s, {
      action: 'flow.update',
      targetType: 'flow',
      targetId: row.id,
      summary: patch.enabled !== undefined && patch.enabled !== row.enabled ? `${patch.enabled ? 'Turned on' : 'Turned off'} flow “${u.name}”` : `Changed flow “${u.name}”`
    });
    return present(u);
  }

  async remove(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await findOwned(this.db, flows, s.companyId, id, 'Flow');
    await this.db.delete(flows).where(eq(flows.id, row.id));
    await this.audit.log(s, { action: 'flow.delete', targetType: 'flow', targetId: row.id, summary: `Deleted flow “${row.name}”` });
    return { ok: true };
  }
}
