import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, isNotNull, ne, sql, sum } from 'drizzle-orm';
import type { AdminAuditEntry, AdminHealth, AdminUsageRow } from '@smart-reply/shared';
import type { Db } from '../../db/client';
import { aiBotLogs, auditLogs, calls, companies, files, messages, usageDaily, users, webhookEvents, whatsappAccounts } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { QUEUE_NAMES, Queues } from '../../infra/queues';

/** Platform usage, health and the platform audit log. */
@Injectable()
export class OpsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly queues: Queues
  ) {}

  async usage(): Promise<AdminUsageRow[]> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const sinceDate = since.toISOString().slice(0, 10);
    const list = await this.db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name);
    if (list.length === 0) return [];
    const ids = list.map(c => c.id);
    const msgs = await this.db
      .select({ companyId: messages.companyId, direction: messages.direction, n: count() })
      .from(messages)
      .where(and(inArray(messages.companyId, ids), inArray(messages.direction, ['in', 'out']), gt(messages.createdAt, since)))
      .groupBy(messages.companyId, messages.direction);
    const callRows = await this.db
      .select({ companyId: calls.companyId, n: count() })
      .from(calls)
      .where(and(inArray(calls.companyId, ids), gt(calls.startedAt, since)))
      .groupBy(calls.companyId);
    const storage = await this.db
      .select({ companyId: files.companyId, bytes: sum(files.sizeBytes) })
      .from(files)
      .where(and(inArray(files.companyId, ids), eq(files.uploaded, true)))
      .groupBy(files.companyId);
    const cost = await this.db
      .select({ companyId: usageDaily.companyId, currency: usageDaily.currency, minor: sum(usageDaily.costMinor) })
      .from(usageDaily)
      .where(and(inArray(usageDaily.companyId, ids), sql`${usageDaily.date} >= ${sinceDate}`))
      .groupBy(usageDaily.companyId, usageDaily.currency);
    const ai = await this.db
      .select({ companyId: aiBotLogs.companyId, n: count() })
      .from(aiBotLogs)
      .where(and(inArray(aiBotLogs.companyId, ids), gt(aiBotLogs.createdAt, since)))
      .groupBy(aiBotLogs.companyId);

    return list.map(c => {
      const costRow = cost.filter(r => r.companyId === c.id);
      return {
        companyId: c.id,
        companyName: c.name,
        messagesIn: Number(msgs.find(m => m.companyId === c.id && m.direction === 'in')?.n ?? 0),
        messagesOut: Number(msgs.find(m => m.companyId === c.id && m.direction === 'out')?.n ?? 0),
        calls: Number(callRows.find(r => r.companyId === c.id)?.n ?? 0),
        storageBytes: Number(storage.find(r => r.companyId === c.id)?.bytes ?? 0),
        metaCost: {
          amountMinor: costRow.reduce((t, r) => t + Number(r.minor ?? 0), 0),
          currency: costRow[0]?.currency ?? 'USD'
        },
        aiReplies: Number(ai.find(r => r.companyId === c.id)?.n ?? 0)
      };
    });
  }

  async health(): Promise<AdminHealth> {
    const queues = await Promise.all(
      QUEUE_NAMES.map(async name => {
        const c = await this.queues.queues[name].getJobCounts('waiting', 'active', 'failed', 'delayed');
        return { name, waiting: c.waiting ?? 0, active: c.active ?? 0, failed: c.failed ?? 0, delayed: c.delayed ?? 0 };
      })
    );
    const [failures] = await this.db
      .select({ n: count() })
      .from(webhookEvents)
      .where(and(isNotNull(webhookEvents.error), gt(webhookEvents.receivedAt, new Date(Date.now() - 86_400_000))));
    const low = await this.db
      .select({ companyId: whatsappAccounts.companyId, companyName: companies.name, displayPhone: whatsappAccounts.displayPhone, qualityRating: whatsappAccounts.qualityRating })
      .from(whatsappAccounts)
      .innerJoin(companies, eq(companies.id, whatsappAccounts.companyId))
      .where(and(eq(whatsappAccounts.status, 'connected'), inArray(sql`upper(${whatsappAccounts.qualityRating})`, ['YELLOW', 'RED'])));
    const [companyCount] = await this.db.select({ n: count() }).from(companies).where(ne(companies.status, 'closed'));
    const [active] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.status, 'active'), ne(users.role, 'system_admin')));
    return {
      queues,
      webhookFailures24h: Number(failures?.n ?? 0),
      lowQualityNumbers: low.map(l => ({
        companyId: l.companyId,
        companyName: l.companyName,
        displayPhone: l.displayPhone ?? '',
        qualityRating: (l.qualityRating ?? '').toUpperCase()
      })),
      companies: Number(companyCount?.n ?? 0),
      activeUsers: Number(active?.n ?? 0)
    };
  }

  /** Latest 200 entries across the platform. Admin entries show which admin acted. */
  async audit(): Promise<AdminAuditEntry[]> {
    const rows = await this.db
      .select({ a: auditLogs, companyName: companies.name, actorRealName: users.name })
      .from(auditLogs)
      .leftJoin(companies, eq(companies.id, auditLogs.companyId))
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.at))
      .limit(200);
    return rows.map(({ a, companyName, actorRealName }) => ({
      id: a.id,
      at: a.at.toISOString(),
      actorName: a.actorKind === 'admin' && actorRealName && a.actorName === 'LUMI AI support' ? `LUMI AI support (${actorRealName})` : a.actorName,
      actorKind: a.actorKind,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      summary: companyName ? `${companyName}: ${a.summary}` : a.summary,
      source: a.source,
      companyId: a.companyId,
      companyName: companyName ?? null
    }));
  }
}
