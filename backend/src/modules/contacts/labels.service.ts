import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Label, LabelColor, labelSchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import type { Db } from '../../db/client';
import { contactLabels, keywordRules, labels } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { isUniqueViolation } from './contacts.service';

type LabelInput = z.infer<typeof labelSchema>;
type LabelRow = typeof labels.$inferSelect;

function present(r: LabelRow, chatCount: number): Label {
  return { id: r.id, name: r.name, color: r.color as LabelColor, meaning: r.meaning, autoRule: r.autoRule, chatCount };
}

@Injectable()
export class LabelsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: Audit
  ) {}

  async list(s: CompanySession): Promise<Label[]> {
    const rows = await this.db.select().from(labels).where(eq(labels.companyId, s.companyId)).orderBy(asc(labels.name));
    const counts = await this.db
      .select({ labelId: contactLabels.labelId, n: count() })
      .from(contactLabels)
      .where(eq(contactLabels.companyId, s.companyId))
      .groupBy(contactLabels.labelId);
    const by = new Map(counts.map(c => [c.labelId, Number(c.n)]));
    return rows.map(r => present(r, by.get(r.id) ?? 0));
  }

  private async assertNameFree(companyId: string, name: string, exceptId?: string): Promise<void> {
    const [hit] = await this.db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.companyId, companyId), sql`lower(${labels.name}) = ${name.toLowerCase()}`, exceptId ? ne(labels.id, exceptId) : undefined))
      .limit(1);
    if (hit) throw new AppError('CONFLICT', `There is already a label called “${name}”.`);
  }

  async create(s: CompanySession, input: LabelInput): Promise<Label> {
    await this.assertNameFree(s.companyId, input.name);
    try {
      const [row] = await this.db.insert(labels).values({ companyId: s.companyId, ...input }).returning();
      await this.audit.log(s, { action: 'label.created', targetType: 'label', targetId: row.id, summary: `Label “${row.name}” added` });
      return present(row, 0);
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', `There is already a label called “${input.name}”.`);
      throw err;
    }
  }

  async update(s: CompanySession, id: string, input: Partial<LabelInput>): Promise<Label> {
    const existing = await findOwned(this.db, labels, s.companyId, id, 'Label');
    if (input.name !== undefined && input.name !== existing.name) await this.assertNameFree(s.companyId, input.name, existing.id);
    const patch: Partial<LabelRow> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;
    if (input.meaning !== undefined) patch.meaning = input.meaning;
    if (input.autoRule !== undefined) patch.autoRule = input.autoRule;
    let row = existing;
    if (Object.keys(patch).length) {
      try {
        [row] = await this.db.update(labels).set(patch).where(eq(labels.id, existing.id)).returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError('CONFLICT', `There is already a label called “${input.name ?? ''}”.`);
        throw err;
      }
      await this.audit.log(s, { action: 'label.updated', targetType: 'label', targetId: row.id, summary: `Label “${row.name}” changed` });
    }
    const [n] = await this.db.select({ n: count() }).from(contactLabels).where(eq(contactLabels.labelId, row.id));
    return present(row, Number(n?.n ?? 0));
  }

  async remove(s: CompanySession, id: string): Promise<void> {
    const existing = await findOwned(this.db, labels, s.companyId, id, 'Label');
    await this.db.transaction(async tx => {
      // keyword_rules.label_id has no foreign key; clear it so rules do not point at nothing.
      await tx
        .update(keywordRules)
        .set({ labelId: null })
        .where(and(eq(keywordRules.companyId, s.companyId), eq(keywordRules.labelId, existing.id)));
      await tx.delete(labels).where(eq(labels.id, existing.id));
    });
    await this.audit.log(s, { action: 'label.deleted', targetType: 'label', targetId: existing.id, summary: `Label “${existing.name}” removed` });
  }
}
