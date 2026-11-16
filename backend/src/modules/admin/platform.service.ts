import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { maskSecret } from '@smart-reply/shared';
import type {
  AiAddonPlan,
  Plan,
  PlatformAiSettings,
  PlatformMetaSettings,
  PlatformWebhookSettings,
  WebhookEventRow,
  aiAddonPlanSchema,
  planSchema,
  platformAiSchema,
  platformMetaSchema,
  platformWebhookSchema,
  webhookEventsQuery
} from '@smart-reply/shared';
import { encrypt, randomToken } from '../../common/crypto';
import { notFound } from '../../common/errors';
import type { Session } from '../../common/session';
import { env } from '../../config';
import type { Db } from '../../db/client';
import { aiAddonPlans, companies, platformSettings, plans, webhookEvents } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Graph } from '../../meta/graph';
import { Platform } from '../../meta/platform';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AdminAudit } from './admin.audit';
import { assertUuid } from './companies.service';

export const callbackUrl = (): string => `${env.API_URL}/api/v1/webhooks/whatsapp`;

/** Platform-wide Meta, webhook and AI settings, plans and add-on plans. */
@Injectable()
export class PlatformAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform,
    private readonly audit: AdminAudit,
    private readonly webhooks: WebhooksService
  ) {}

  /* ───────── Meta app ───────── */

  async meta(): Promise<PlatformMetaSettings> {
    const row = await this.platform.row();
    const p = await this.platform.get();
    return {
      appId: p.appId,
      appSecretMasked: maskSecret(p.appSecret),
      graphVersion: p.graphVersion,
      verifyTokenMasked: maskSecret(p.verifyToken),
      embeddedSignupConfigId: p.embeddedSignupConfigId,
      systemTokenMasked: maskSecret(p.systemToken),
      callbackUrl: callbackUrl(),
      subscribedFields: p.subscribedFields,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async saveMeta(s: Session, input: z.infer<typeof platformMetaSchema>): Promise<PlatformMetaSettings> {
    await this.platform.row();
    await this.db
      .update(platformSettings)
      .set({
        metaAppId: input.appId,
        metaGraphVersion: input.graphVersion,
        metaEmbeddedSignupConfigId: input.embeddedSignupConfigId,
        ...(input.appSecret ? { metaAppSecretEnc: encrypt(input.appSecret) } : {}),
        ...(input.verifyToken ? { metaVerifyTokenEnc: encrypt(input.verifyToken) } : {}),
        ...(input.systemToken ? { metaSystemTokenEnc: encrypt(input.systemToken) } : {})
      })
      .where(eq(platformSettings.id, 1));
    this.platform.invalidate();
    const changed = ['appSecret', 'verifyToken', 'systemToken'].filter(k => input[k as keyof typeof input]);
    await this.audit.log(s, null, {
      action: 'platform.meta_updated',
      targetType: 'platform',
      targetId: 'meta',
      summary: `Meta app settings saved (app ${input.appId || 'none'}, ${input.graphVersion}${changed.length ? `; new ${changed.join(', ')}` : ''})`
    });
    return this.meta();
  }

  async testMeta(): Promise<{ ok: boolean; message: string }> {
    const p = await this.platform.get();
    if (!p.appId || !p.appSecret) return { ok: false, message: 'Enter the Meta app id and app secret first.' };
    return Graph.checkApp(p.graphVersion, p.appId, p.appSecret);
  }

  /* ───────── Webhook ───────── */

  async webhook(): Promise<PlatformWebhookSettings> {
    const p = await this.platform.get();
    return { callbackUrl: callbackUrl(), verifyTokenMasked: maskSecret(p.verifyToken), subscribedFields: p.subscribedFields };
  }

  async saveWebhook(s: Session, input: z.infer<typeof platformWebhookSchema>): Promise<PlatformWebhookSettings> {
    await this.platform.row();
    await this.db
      .update(platformSettings)
      .set({
        ...(input.verifyToken ? { metaVerifyTokenEnc: encrypt(input.verifyToken) } : {}),
        ...(input.subscribedFields ? { metaSubscribedFields: [...new Set(input.subscribedFields)] } : {})
      })
      .where(eq(platformSettings.id, 1));
    this.platform.invalidate();
    await this.audit.log(s, null, {
      action: 'platform.webhook_updated',
      targetType: 'platform',
      targetId: 'webhook',
      summary: `Webhook settings saved${input.verifyToken ? ' (new verify token)' : ''}${input.subscribedFields ? `; fields: ${input.subscribedFields.join(', ')}` : ''}`
    });
    return this.webhook();
  }

  /** A synthetic event with no company goes through store → queue → worker. */
  async testWebhook(s: Session): Promise<{ ok: boolean; stored: number }> {
    const stored = await this.webhooks.store({
      object: 'whatsapp_business_account',
      entry: [{ id: 'smart-reply-test', changes: [{ field: 'test', value: { test: true, nonce: randomToken(8), at: new Date().toISOString() } }] }]
    });
    await this.audit.log(s, null, { action: 'platform.webhook_test', targetType: 'platform', targetId: 'webhook', summary: 'Sent a test webhook event' });
    return { ok: stored > 0, stored };
  }

  async events(q: z.infer<typeof webhookEventsQuery>): Promise<WebhookEventRow[]> {
    const status =
      q.status === 'failed'
        ? and(isNotNull(webhookEvents.error), isNull(webhookEvents.processedAt))
        : q.status === 'pending'
          ? and(isNull(webhookEvents.processedAt), isNull(webhookEvents.error))
          : q.status === 'processed'
            ? isNotNull(webhookEvents.processedAt)
            : undefined;
    const rows = await this.db
      .select({
        id: webhookEvents.id,
        companyId: webhookEvents.companyId,
        companyName: companies.name,
        field: webhookEvents.field,
        kind: webhookEvents.kind,
        receivedAt: webhookEvents.receivedAt,
        processedAt: webhookEvents.processedAt,
        attempts: webhookEvents.attempts,
        error: webhookEvents.error
      })
      .from(webhookEvents)
      .leftJoin(companies, eq(companies.id, webhookEvents.companyId))
      .where(and(q.company ? eq(webhookEvents.companyId, q.company) : undefined, status))
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(q.limit);
    return rows.map(r => ({
      ...r,
      companyName: r.companyName ?? null,
      receivedAt: r.receivedAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null
    }));
  }

  async replay(s: Session, id: string): Promise<{ ok: true }> {
    assertUuid(id, 'Webhook event');
    const [ev] = await this.db.select({ id: webhookEvents.id, companyId: webhookEvents.companyId, field: webhookEvents.field }).from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
    if (!ev) throw notFound('Webhook event');
    await this.webhooks.replay(id);
    await this.audit.log(s, null, { action: 'webhook.replayed', targetType: 'webhook_event', targetId: id, summary: `Replayed a ${ev.field} webhook event` });
    return { ok: true };
  }

  /* ───────── AI provider ───────── */

  async ai(): Promise<PlatformAiSettings> {
    const p = await this.platform.get();
    return {
      provider: p.ai.provider,
      apiKeyMasked: maskSecret(p.ai.apiKey),
      defaultModel: p.ai.model,
      baseUrl: p.ai.baseUrl,
      defaultPrompt: p.ai.defaultPrompt,
      globalOff: p.ai.globalOff
    };
  }

  async saveAi(s: Session, input: z.infer<typeof platformAiSchema>): Promise<PlatformAiSettings> {
    await this.platform.row();
    await this.db
      .update(platformSettings)
      .set({
        aiProvider: input.provider,
        aiDefaultModel: input.defaultModel,
        aiBaseUrl: input.baseUrl,
        aiDefaultPrompt: input.defaultPrompt,
        aiGlobalOff: input.globalOff,
        ...(input.apiKey ? { aiApiKeyEnc: encrypt(input.apiKey) } : {})
      })
      .where(eq(platformSettings.id, 1));
    this.platform.invalidate();
    await this.audit.log(s, null, {
      action: 'platform.ai_updated',
      targetType: 'platform',
      targetId: 'ai',
      summary: `AI platform settings saved (${input.provider}, ${input.defaultModel || 'no model'}${input.globalOff ? ', bot switched off everywhere' : ''}${input.apiKey ? ', new API key' : ''})`
    });
    return this.ai();
  }

  /* ───────── Plans ───────── */

  async plans(): Promise<Plan[]> {
    const rows = await this.db.select().from(plans).orderBy(plans.seatLimit, plans.name);
    const counts = rows.length
      ? await this.db
          .select({ planId: companies.planId, n: count() })
          .from(companies)
          .where(inArray(companies.planId, rows.map(r => r.id)))
          .groupBy(companies.planId)
      : [];
    const by = new Map(counts.map(c => [c.planId, Number(c.n)]));
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      seatLimit: r.seatLimit,
      price: { amountMinor: r.priceMinor, currency: r.currency },
      features: r.features,
      companyCount: by.get(r.id) ?? 0
    }));
  }

  private async plan(id: string): Promise<Plan> {
    const p = (await this.plans()).find(x => x.id === id);
    if (!p) throw notFound('Plan');
    return p;
  }

  async createPlan(s: Session, input: z.infer<typeof planSchema>): Promise<Plan> {
    const [row] = await this.db
      .insert(plans)
      .values({ name: input.name, seatLimit: input.seatLimit, priceMinor: input.priceMinor, currency: input.currency, features: input.features })
      .returning();
    await this.audit.log(s, null, { action: 'plan.created', targetType: 'plan', targetId: row.id, summary: `Created plan ${row.name} (${row.seatLimit} seats)` });
    return this.plan(row.id);
  }

  async updatePlan(s: Session, id: string, input: Partial<z.infer<typeof planSchema>>): Promise<Plan> {
    assertUuid(id, 'Plan');
    const [row] = await this.db
      .update(plans)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
        ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.features !== undefined ? { features: input.features } : {})
      })
      .where(eq(plans.id, id))
      .returning();
    if (!row) throw notFound('Plan');
    await this.audit.log(s, null, { action: 'plan.updated', targetType: 'plan', targetId: id, summary: `Changed plan ${row.name}` });
    return this.plan(id);
  }

  /* ───────── AI add-on plans ───────── */

  private presentAddonPlan(r: typeof aiAddonPlans.$inferSelect): AiAddonPlan {
    return { id: r.id, name: r.name, price: { amountMinor: r.priceMinor, currency: r.currency }, monthlyReplyLimit: r.monthlyReplyLimit, voiceIncluded: r.voiceIncluded };
  }

  async addonPlans(): Promise<AiAddonPlan[]> {
    const rows = await this.db.select().from(aiAddonPlans).orderBy(aiAddonPlans.priceMinor, aiAddonPlans.name);
    return rows.map(r => this.presentAddonPlan(r));
  }

  async createAddonPlan(s: Session, input: z.infer<typeof aiAddonPlanSchema>): Promise<AiAddonPlan> {
    const [row] = await this.db.insert(aiAddonPlans).values(input).returning();
    await this.audit.log(s, null, { action: 'ai_plan.created', targetType: 'ai_addon_plan', targetId: row.id, summary: `Created AI add-on plan ${row.name}` });
    return this.presentAddonPlan(row);
  }

  async updateAddonPlan(s: Session, id: string, input: Partial<z.infer<typeof aiAddonPlanSchema>>): Promise<AiAddonPlan> {
    assertUuid(id, 'AI add-on plan');
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const [row] = Object.keys(patch).length
      ? await this.db.update(aiAddonPlans).set(patch).where(eq(aiAddonPlans.id, id)).returning()
      : await this.db.select().from(aiAddonPlans).where(eq(aiAddonPlans.id, id)).limit(1);
    if (!row) throw notFound('AI add-on plan');
    await this.audit.log(s, null, { action: 'ai_plan.updated', targetType: 'ai_addon_plan', targetId: id, summary: `Changed AI add-on plan ${row.name}` });
    return this.presentAddonPlan(row);
  }
}
