/** Assignment rules, keyword rules and weekly targets (manager screens). */
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AssignmentRules, KeywordRule, StaffTarget, assignmentRulesSchema, keywordRuleSchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { notFound } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { findOwned } from '../../common/tenant';
import type { Db } from '../../db/client';
import { assignmentRules, keywordRules, labels, quickReplies, staffTargets, templates, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';

type KeywordInput = z.infer<typeof keywordRuleSchema>;
type KeywordRow = typeof keywordRules.$inferSelect;

/** Same as the column defaults in db/schema.ts. */
const DEFAULT_RULES: AssignmentRules = {
  autoAssign: 'round_robin',
  stickyOwner: true,
  maxOpenChats: 25,
  unassignedAlertMinutes: 10,
  callRingOwnerFirst: true,
  missedCallTemplateId: null,
  skipOnBreak: true
};

function presentKeywordRule(r: KeywordRow): KeywordRule {
  return {
    id: r.id,
    keywords: r.keywords,
    labelId: r.labelId,
    assignUserId: r.assignUserId,
    quickReplyId: r.quickReplyId,
    enabled: r.enabled,
    matchCount: r.matchCount
  };
}

@Injectable()
export class RulesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: Audit
  ) {}

  /* ───────── Assignment rules ───────── */

  async assignment(s: CompanySession): Promise<AssignmentRules> {
    const [r] = await this.db.select().from(assignmentRules).where(eq(assignmentRules.companyId, s.companyId)).limit(1);
    if (!r) return { ...DEFAULT_RULES };
    return {
      autoAssign: r.autoAssign,
      stickyOwner: r.stickyOwner,
      maxOpenChats: r.maxOpenChats,
      unassignedAlertMinutes: r.unassignedAlertMinutes,
      callRingOwnerFirst: r.callRingOwnerFirst,
      missedCallTemplateId: r.missedCallTemplateId,
      skipOnBreak: r.skipOnBreak
    };
  }

  async setAssignment(s: CompanySession, input: z.infer<typeof assignmentRulesSchema>): Promise<AssignmentRules> {
    if (input.missedCallTemplateId) await findOwned(this.db, templates, s.companyId, input.missedCallTemplateId, 'Template');
    await this.db
      .insert(assignmentRules)
      .values({ companyId: s.companyId, ...input })
      .onConflictDoUpdate({ target: assignmentRules.companyId, set: { ...input } });
    await this.audit.log(s, {
      action: 'settings.assignment_rules',
      targetType: 'assignment_rules',
      targetId: s.companyId,
      summary: `Assignment rules: ${input.autoAssign}, max ${input.maxOpenChats} open chats${input.skipOnBreak ? ', skip staff on break' : ''}`
    });
    return this.assignment(s);
  }

  /* ───────── Keyword rules ───────── */

  async keywordRules(s: CompanySession): Promise<KeywordRule[]> {
    const rows = await this.db.select().from(keywordRules).where(eq(keywordRules.companyId, s.companyId)).orderBy(asc(keywordRules.createdAt));
    return rows.map(presentKeywordRule);
  }

  private async checkRefs(s: CompanySession, input: Partial<KeywordInput>): Promise<void> {
    if (input.labelId) await findOwned(this.db, labels, s.companyId, input.labelId, 'Label');
    if (input.quickReplyId) await findOwned(this.db, quickReplies, s.companyId, input.quickReplyId, 'Quick reply');
    if (input.assignUserId) {
      const u = await findOwned(this.db, users, s.companyId, input.assignUserId, 'Staff member');
      if (u.status !== 'active' || u.role === 'system_admin') throw notFound('Staff member');
    }
  }

  private static cleanKeywords(list: string[]): string[] {
    return [...new Set(list.map(k => k.trim().toLowerCase()).filter(Boolean))];
  }

  async createKeywordRule(s: CompanySession, input: KeywordInput): Promise<KeywordRule> {
    await this.checkRefs(s, input);
    const [row] = await this.db
      .insert(keywordRules)
      .values({ companyId: s.companyId, ...input, keywords: RulesService.cleanKeywords(input.keywords) })
      .returning();
    await this.audit.log(s, { action: 'keyword_rule.created', targetType: 'keyword_rule', targetId: row.id, summary: `Keyword rule “${row.keywords.join(', ')}”` });
    return presentKeywordRule(row);
  }

  async updateKeywordRule(s: CompanySession, id: string, input: Partial<KeywordInput>): Promise<KeywordRule> {
    const existing = await findOwned(this.db, keywordRules, s.companyId, id, 'Keyword rule');
    await this.checkRefs(s, input);
    const patch: Partial<KeywordRow> = {};
    if (input.keywords !== undefined) patch.keywords = RulesService.cleanKeywords(input.keywords);
    if (input.labelId !== undefined) patch.labelId = input.labelId;
    if (input.assignUserId !== undefined) patch.assignUserId = input.assignUserId;
    if (input.quickReplyId !== undefined) patch.quickReplyId = input.quickReplyId;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (Object.keys(patch).length === 0) return presentKeywordRule(existing);
    const [row] = await this.db.update(keywordRules).set(patch).where(eq(keywordRules.id, existing.id)).returning();
    await this.audit.log(s, { action: 'keyword_rule.updated', targetType: 'keyword_rule', targetId: row.id, summary: `Keyword rule “${row.keywords.join(', ')}” changed` });
    return presentKeywordRule(row);
  }

  async deleteKeywordRule(s: CompanySession, id: string): Promise<void> {
    const existing = await findOwned(this.db, keywordRules, s.companyId, id, 'Keyword rule');
    await this.db.delete(keywordRules).where(eq(keywordRules.id, existing.id));
    await this.audit.log(s, { action: 'keyword_rule.deleted', targetType: 'keyword_rule', targetId: existing.id, summary: `Keyword rule “${existing.keywords.join(', ')}” removed` });
  }

  /* ───────── Targets ───────── */

  /** One row per active manager or staff member; 0 when no target is set. */
  async targets(s: CompanySession): Promise<StaffTarget[]> {
    const people = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, s.companyId), inArray(users.role, ['manager', 'staff']), eq(users.status, 'active')))
      .orderBy(asc(users.name));
    const rows = await this.db.select().from(staffTargets).where(eq(staffTargets.companyId, s.companyId));
    const by = new Map(rows.map(r => [r.userId, r.resolvedTarget]));
    return people.map(p => ({ userId: p.id, resolvedTarget: by.get(p.id) ?? 0 }));
  }

  async setTargets(s: CompanySession, list: StaffTarget[]): Promise<StaffTarget[]> {
    const ids = [...new Set(list.map(t => t.userId))];
    if (ids.length) {
      const found = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.companyId, s.companyId), inArray(users.id, ids), inArray(users.role, ['manager', 'staff'])));
      if (found.length !== ids.length) throw notFound('Staff member');
      await this.db.transaction(async tx => {
        for (const t of list) {
          await tx
            .insert(staffTargets)
            .values({ companyId: s.companyId, userId: t.userId, resolvedTarget: t.resolvedTarget })
            .onConflictDoUpdate({ target: [staffTargets.companyId, staffTargets.userId], set: { resolvedTarget: t.resolvedTarget } });
        }
      });
      await this.audit.log(s, { action: 'targets.updated', targetType: 'staff_targets', targetId: s.companyId, summary: `Weekly targets set for ${ids.length} people` });
    }
    return this.targets(s);
  }
}
