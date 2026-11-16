/**
 * Manager setup screens: Meta usage and invoices, business profile, the read-only WhatsApp
 * number view, webhook health and the audit log.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lt, lte, or, sql, SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuditEntry,
  BusinessProfile,
  IntegrationStatus,
  IntegrationTestResponse,
  Invoice,
  Page,
  UsageResponse,
  WebhookEventRow,
  WhatsappAccountView,
  auditQuery,
  businessProfileSchema
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import type { Db } from '../../db/client';
import { auditLogs, businessProfiles, companies, invoices, usageDaily, webhookEvents, whatsappAccounts } from '../../db/schema';
import { env } from '../../config';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { MetaBusinessProfile, toAppError } from '../../meta/graph';
import { WhatsappAccounts } from '../../meta/platform';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MetricsService } from './metrics.service';
import { RATE_CURRENCY, microToMinor, rateFor } from './rates';
import { localMonth } from './time';

/** Values Meta accepts for `vertical` on the business profile (checked November 2026). */
export const META_VERTICALS = [
  'ALCOHOL',
  'APPAREL',
  'AUTO',
  'BEAUTY',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GOVT',
  'GROCERY',
  'HEALTH',
  'HOTEL',
  'NONPROFIT',
  'ONLINE_GAMBLING',
  'OTC_DRUGS',
  'OTHER',
  'PHYSICAL_GAMBLING',
  'PROF_SERVICES',
  'RESTAURANT',
  'RETAIL',
  'TRAVEL'
] as const;

type ProfileRow = typeof businessProfiles.$inferSelect;
type AccountRow = typeof whatsappAccounts.$inferSelect;

/** The cursor is the id of the last row shown; rows sort by time, then id. */
function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}
function decodeCursor(c: string | undefined): string | null {
  if (!c) return null;
  const id = Buffer.from(c, 'base64url').toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function quality(v: string | null): WhatsappAccountView['qualityRating'] {
  if (!v) return null;
  const u = v.toUpperCase();
  return u === 'GREEN' || u === 'YELLOW' || u === 'RED' ? u : 'UNKNOWN';
}

function websiteForMeta(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

@Injectable()
export class SetupService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly whatsapp: WhatsappAccounts,
    private readonly webhooks: WebhooksService,
    private readonly metrics: MetricsService,
    private readonly audit: Audit
  ) {}

  /* ───────── Billing ───────── */

  async usage(s: CompanySession, month: string | undefined): Promise<UsageResponse> {
    const c = await this.metrics.company(s.companyId);
    const m = month ?? localMonth(new Date(), c.tz);
    const [y, mo] = m.split('-').map(Number);
    const first = `${m}-01`;
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    const rows = await this.db
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.companyId, s.companyId), gte(usageDaily.date, first), lt(usageDaily.date, next)))
      .orderBy(usageDaily.date);
    const byCat = new Map<string, { delivered: number; billable: number; storedMinor: number; storedCurrency: string | null }>();
    const byDay = new Map<string, { delivered: number; billable: number }>();
    let freeReplies = 0;
    for (const r of rows) {
      const cat = byCat.get(r.category) ?? { delivered: 0, billable: 0, storedMinor: 0, storedCurrency: null };
      cat.delivered += r.deliveredCount;
      cat.billable += r.billableCount;
      if (r.costMinor > 0 && r.currency === RATE_CURRENCY) {
        cat.storedMinor += r.costMinor;
        cat.storedCurrency = r.currency;
      }
      byCat.set(r.category, cat);
      const day = byDay.get(r.date) ?? { delivered: 0, billable: 0 };
      day.delivered += r.deliveredCount;
      day.billable += r.billableCount;
      byDay.set(r.date, day);
      freeReplies += Math.max(0, r.deliveredCount - r.billableCount);
    }
    const byCategory = [...byCat.entries()]
      .sort((a, b) => b[1].billable - a[1].billable || a[0].localeCompare(b[0]))
      .map(([category, v]) => {
        const amountMinor = v.storedMinor > 0 ? v.storedMinor : microToMinor(v.billable * rateFor(c.countryCode, category));
        return { category, delivered: v.delivered, billable: v.billable, cost: { amountMinor, currency: RATE_CURRENCY } };
      });
    return {
      month: m,
      freeReplies,
      byCategory,
      total: { amountMinor: byCategory.reduce((n, x) => n + x.cost.amountMinor, 0), currency: RATE_CURRENCY },
      daily: [...byDay.entries()].map(([date, v]) => ({ date, ...v }))
    };
  }

  async invoices(s: CompanySession): Promise<Invoice[]> {
    const rows = await this.db.select().from(invoices).where(eq(invoices.companyId, s.companyId)).orderBy(desc(invoices.issuedAt));
    return rows.map(r => ({
      id: r.id,
      number: r.number,
      period: r.period,
      amount: { amountMinor: r.amountMinor, currency: r.currency },
      status: r.status,
      issuedAt: r.issuedAt.toISOString()
    }));
  }

  /* ───────── Business profile ───────── */

  private present(row: ProfileRow | null, fallbackName: string): BusinessProfile {
    return {
      displayName: row?.displayName || fallbackName,
      about: row?.about ?? '',
      description: row?.description ?? '',
      address: row?.address ?? '',
      website: row?.website ?? '',
      email: row?.email ?? '',
      vertical: row?.vertical ?? '',
      greetingText: row?.greetingText ?? '',
      greetingOn: row?.greetingOn ?? false,
      awayText: row?.awayText ?? '',
      awayOn: row?.awayOn ?? false,
      syncedAt: row?.syncedAt?.toISOString() ?? null
    };
  }

  private async fallbackName(companyId: string, account: AccountRow | null): Promise<string> {
    if (account?.verifiedName) return account.verifiedName;
    const [c] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    return c?.name ?? '';
  }

  async getProfile(s: CompanySession): Promise<BusinessProfile> {
    let [row] = await this.db.select().from(businessProfiles).where(eq(businessProfiles.companyId, s.companyId)).limit(1);
    const wa = await this.whatsapp.find(s.companyId);
    // Fill from WhatsApp only when we hold nothing of our own yet, so a failed push never
    // gets overwritten by Meta's older copy.
    const emptyLocal = !row || (!row.about && !row.description && !row.address && !row.website && !row.email && !row.vertical);
    if (wa && emptyLocal && !row?.syncedAt) {
      try {
        const meta = await wa.graph.businessProfile(wa.phoneNumberId);
        if (meta) {
          const values = {
            about: meta.about ?? '',
            description: meta.description ?? '',
            address: meta.address ?? '',
            email: meta.email ?? '',
            website: meta.websites?.[0] ?? '',
            vertical: meta.vertical && meta.vertical !== 'UNDEFINED' ? meta.vertical : '',
            syncedAt: new Date()
          };
          [row] = await this.db
            .insert(businessProfiles)
            .values({ companyId: s.companyId, ...values })
            .onConflictDoUpdate({ target: businessProfiles.companyId, set: values })
            .returning();
        }
      } catch (err) {
        logger.warn({ companyId: s.companyId, err: err instanceof Error ? err.message : String(err) }, 'Could not read business profile from WhatsApp');
      }
    }
    return this.present(row ?? null, await this.fallbackName(s.companyId, wa?.account ?? null));
  }

  async putProfile(s: CompanySession, body: z.infer<typeof businessProfileSchema>): Promise<BusinessProfile> {
    const values = { ...body, syncedAt: null };
    let [row] = await this.db
      .insert(businessProfiles)
      .values({ companyId: s.companyId, ...values })
      .onConflictDoUpdate({ target: businessProfiles.companyId, set: values })
      .returning();
    await this.audit.log(s, { action: 'business_profile.update', targetType: 'business_profile', targetId: s.companyId, summary: 'Updated the business profile' });

    const wa = await this.whatsapp.find(s.companyId);
    if (wa) {
      const vertical = body.vertical.trim().toUpperCase();
      const profile: Partial<MetaBusinessProfile> = {
        about: body.about,
        address: body.address,
        description: body.description,
        email: body.email,
        ...(body.website ? { websites: [websiteForMeta(body.website)] } : {}),
        ...((META_VERTICALS as readonly string[]).includes(vertical) ? { vertical } : {})
      };
      try {
        await wa.graph.updateBusinessProfile(wa.phoneNumberId, profile);
      } catch (err) {
        logger.warn({ companyId: s.companyId }, 'Business profile saved but WhatsApp update failed');
        throw toAppError(err);
      }
      [row] = await this.db.update(businessProfiles).set({ syncedAt: new Date() }).where(eq(businessProfiles.companyId, s.companyId)).returning();
    }
    return this.present(row, await this.fallbackName(s.companyId, wa?.account ?? null));
  }

  /* ───────── WhatsApp number (read only) ───────── */

  private async accountRow(companyId: string): Promise<AccountRow | null> {
    const [a] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId)).limit(1);
    return a ?? null;
  }

  private view(a: AccountRow | null): WhatsappAccountView {
    if (!a) {
      return {
        connected: false,
        wabaId: null,
        phoneNumberId: null,
        displayPhone: null,
        verifiedName: null,
        nameStatus: null,
        qualityRating: null,
        messagingLimit: null,
        callingEnabled: false,
        webhookSubscribedAt: null,
        connectedAt: null,
        connectMethod: null,
        status: 'disconnected',
        lastError: null
      };
    }
    return {
      connected: a.status === 'connected',
      wabaId: a.wabaId,
      phoneNumberId: a.phoneNumberId,
      displayPhone: a.displayPhone,
      verifiedName: a.verifiedName,
      nameStatus: a.nameStatus,
      qualityRating: quality(a.qualityRating),
      messagingLimit: a.messagingLimit,
      callingEnabled: a.callingEnabled,
      webhookSubscribedAt: a.webhookSubscribedAt?.toISOString() ?? null,
      connectedAt: a.connectedAt.toISOString(),
      connectMethod: a.connectMethod,
      status: a.status,
      lastError: a.lastError
    };
  }

  async account(s: CompanySession): Promise<WhatsappAccountView> {
    return this.view(await this.accountRow(s.companyId));
  }

  /** Re-read the number's name, quality and limit from Meta. Changes nothing at Meta. */
  async refreshAccount(s: CompanySession): Promise<WhatsappAccountView> {
    const wa = await this.whatsapp.require(s.companyId);
    let info;
    try {
      info = await wa.graph.phoneNumber(wa.phoneNumberId);
    } catch (err) {
      throw toAppError(err);
    }
    const patch: Partial<AccountRow> = {};
    if (info.display_phone_number) patch.displayPhone = info.display_phone_number;
    if (info.verified_name) patch.verifiedName = info.verified_name;
    if (info.name_status) patch.nameStatus = info.name_status;
    if (info.quality_rating) patch.qualityRating = info.quality_rating;
    if (info.whatsapp_business_manager_messaging_limit) patch.messagingLimit = info.whatsapp_business_manager_messaging_limit;
    if (Object.keys(patch).length) {
      await this.db.update(whatsappAccounts).set(patch).where(eq(whatsappAccounts.companyId, s.companyId));
    }
    return this.view(await this.accountRow(s.companyId));
  }

  /* ───────── Webhook integration ───────── */

  /** This company's events: routed to it, or not yet routed but addressed to its number. */
  private async eventScope(companyId: string): Promise<SQL> {
    const a = await this.accountRow(companyId);
    const own = eq(webhookEvents.companyId, companyId);
    if (!a) return own;
    return or(own, and(isNull(webhookEvents.companyId), eq(webhookEvents.phoneNumberId, a.phoneNumberId))) as SQL;
  }

  async webhookStatus(s: CompanySession): Promise<IntegrationStatus> {
    const scope = await this.eventScope(s.companyId);
    const since = new Date(Date.now() - 24 * 3600_000);
    const [agg] = await this.db
      .select({
        last: sql<Date | string | null>`max(${webhookEvents.receivedAt})`,
        events: sql<number>`count(*) filter (where ${webhookEvents.receivedAt} >= ${since})::int`,
        failures: sql<number>`count(*) filter (where ${webhookEvents.receivedAt} >= ${since} and ${webhookEvents.error} is not null)::int`
      })
      .from(webhookEvents)
      .where(scope);
    const a = await this.accountRow(s.companyId);
    return {
      callbackUrl: `${env.API_URL.replace(/\/$/, '')}/api/v1/webhooks/whatsapp`,
      lastEventAt: agg?.last ? new Date(agg.last).toISOString() : null,
      failures24h: Number(agg?.failures ?? 0),
      events24h: Number(agg?.events ?? 0),
      subscribed: Boolean(a?.webhookSubscribedAt)
    };
  }

  async webhookEvents(s: CompanySession): Promise<WebhookEventRow[]> {
    const scope = await this.eventScope(s.companyId);
    const [c] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, s.companyId)).limit(1);
    const rows = await this.db
      .select({
        id: webhookEvents.id,
        field: webhookEvents.field,
        kind: webhookEvents.kind,
        receivedAt: webhookEvents.receivedAt,
        processedAt: webhookEvents.processedAt,
        attempts: webhookEvents.attempts,
        error: webhookEvents.error
      })
      .from(webhookEvents)
      .where(scope)
      .orderBy(desc(webhookEvents.receivedAt), desc(webhookEvents.id))
      .limit(100);
    return rows.map(r => ({
      id: r.id,
      companyId: s.companyId,
      companyName: c?.name ?? null,
      field: r.field,
      kind: r.kind,
      receivedAt: r.receivedAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
      attempts: r.attempts,
      // Errors are written by our worker and never hold message text; keep them short anyway.
      error: r.error ? r.error.slice(0, 300) : null
    }));
  }

  /** Store a synthetic event for this company's number so it runs through the queue and worker. */
  async testWebhook(s: CompanySession): Promise<IntegrationTestResponse> {
    const wa = await this.whatsapp.require(s.companyId);
    const value = { metadata: { phone_number_id: wa.phoneNumberId }, test: true, at: new Date().toISOString(), by: s.userId };
    const stored = await this.webhooks.store({ object: 'whatsapp_business_account', entry: [{ id: wa.wabaId, changes: [{ field: 'test', value }] }] });
    const dedupeKey = `test:${sha256(JSON.stringify(value))}`;
    const [ev] = await this.db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.dedupeKey, dedupeKey)).limit(1);
    if (!stored || !ev) throw new AppError('INTERNAL', 'The test event could not be stored. Try again.');
    await this.audit.log(s, { action: 'integration.test', targetType: 'webhook_event', targetId: ev.id, summary: 'Sent a test webhook event' });
    return { ok: true, eventId: ev.id };
  }

  /* ───────── Audit log ───────── */

  async auditLog(s: CompanySession, q: z.infer<typeof auditQuery>): Promise<Page<AuditEntry>> {
    const cursor = decodeCursor(q.cursor);
    const conds: (SQL | undefined)[] = [eq(auditLogs.companyId, s.companyId)];
    if (q.actor) conds.push(eq(auditLogs.actorUserId, q.actor));
    if (q.action) conds.push(sql`${auditLogs.action} like ${q.action.replace(/[\\%_]/g, m => `\\${m}`) + '%'}`);
    if (q.from) conds.push(gte(auditLogs.at, new Date(q.from)));
    if (q.to) conds.push(lte(auditLogs.at, new Date(q.to)));
    if (cursor) {
      conds.push(
        sql`(${auditLogs.at}, ${auditLogs.id}) < (select a.at, a.id from audit_logs a where a.id = ${cursor} and a.company_id = ${s.companyId})`
      );
    }
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conds))
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(r => ({
        id: r.id,
        at: r.at.toISOString(),
        actorName: r.actorName,
        actorKind: r.actorKind,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        summary: r.summary,
        source: r.source
      })),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.id) : null
    };
  }
}
