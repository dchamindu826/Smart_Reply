/**
 * Connecting a company's WhatsApp number. System admins only (AGENTS.md rule 11), plus the
 * one-time connect link that opens nothing but Meta's Embedded Signup popup.
 * Steps follow docs/plan/04-whatsapp-integration.md: exchange code → register → subscribe → read.
 */
import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { maskSecret } from '@smart-reply/shared';
import type { ConnectLinkResponse, EmbeddedSignupConfig, WhatsappAccountAdminView, WhatsappConnectResponse } from '@smart-reply/shared';
import { decrypt, encrypt, randomToken, sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { Audit } from '../../common/audit';
import type { Session } from '../../common/session';
import { env } from '../../config';
import type { Db } from '../../db/client';
import { companies, connectLinks, whatsappAccounts } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Graph, toAppError } from '../../meta/graph';
import { Platform } from '../../meta/platform';
import { AdminAudit } from './admin.audit';
import { CompaniesService } from './companies.service';

type AccountRow = typeof whatsappAccounts.$inferSelect;
const LINK_HOURS = 24;
const QUALITY = new Set(['GREEN', 'YELLOW', 'RED', 'UNKNOWN']);

export function presentAccount(a: AccountRow | undefined): WhatsappAccountAdminView {
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
      lastError: null,
      tokenMasked: null,
      tokenSetAt: null
    };
  }
  let token: string | null = null;
  try {
    token = decrypt(a.accessTokenEnc);
  } catch {
    token = null;
  }
  const q = (a.qualityRating ?? '').toUpperCase();
  return {
    connected: a.status === 'connected',
    wabaId: a.wabaId,
    phoneNumberId: a.phoneNumberId,
    displayPhone: a.displayPhone,
    verifiedName: a.verifiedName,
    nameStatus: a.nameStatus,
    qualityRating: a.qualityRating ? ((QUALITY.has(q) ? q : 'UNKNOWN') as WhatsappAccountAdminView['qualityRating']) : null,
    messagingLimit: a.messagingLimit,
    callingEnabled: a.callingEnabled,
    webhookSubscribedAt: a.webhookSubscribedAt?.toISOString() ?? null,
    connectedAt: a.connectedAt.toISOString(),
    connectMethod: a.connectMethod,
    status: a.status,
    lastError: a.lastError,
    tokenMasked: maskSecret(token),
    tokenSetAt: a.tokenSetAt.toISOString()
  };
}

interface ConnectInput {
  wabaId: string;
  phoneNumberId: string;
  token: string;
  pin: string | null;
  method: 'embedded_signup' | 'manual';
  by: string | null;
}

@Injectable()
export class WhatsappConnectService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform,
    private readonly companies: CompaniesService,
    private readonly audit: AdminAudit,
    private readonly systemAudit: Audit
  ) {}

  private async account(companyId: string): Promise<AccountRow | undefined> {
    const [a] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId)).limit(1);
    return a;
  }

  private async requireAccount(companyId: string): Promise<AccountRow> {
    const a = await this.account(companyId);
    if (!a) throw new AppError('WHATSAPP_NOT_CONNECTED', 'This company has no WhatsApp number yet.');
    return a;
  }

  async view(companyId: string): Promise<WhatsappAccountAdminView> {
    await this.companies.require(companyId);
    return presentAccount(await this.account(companyId));
  }

  private async saveError(companyId: string, err: AppError): Promise<void> {
    await this.db.update(whatsappAccounts).set({ status: 'error', lastError: err.message.slice(0, 500) }).where(eq(whatsappAccounts.companyId, companyId));
  }

  private phoneFields(info: Awaited<ReturnType<Graph['phoneNumber']>>) {
    return {
      displayPhone: info.display_phone_number ?? null,
      verifiedName: info.verified_name ?? null,
      nameStatus: info.name_status ?? null,
      qualityRating: info.quality_rating ?? null,
      messagingLimit: info.whatsapp_business_manager_messaging_limit ?? null
    };
  }

  /** Register (when a PIN is given), subscribe the app, read the number, then store the encrypted token. */
  private async connect(companyId: string, input: ConnectInput): Promise<AccountRow> {
    const [other] = await this.db
      .select({ id: whatsappAccounts.id })
      .from(whatsappAccounts)
      .where(and(eq(whatsappAccounts.phoneNumberId, input.phoneNumberId), ne(whatsappAccounts.companyId, companyId)))
      .limit(1);
    if (other) throw new AppError('CONFLICT', 'This phone number is already connected to another company.');
    const { graphVersion } = await this.platform.get();
    const graph = new Graph({ token: input.token, version: graphVersion });
    let info: Awaited<ReturnType<Graph['phoneNumber']>>;
    try {
      if (input.pin) await graph.register(input.phoneNumberId, input.pin);
      await graph.subscribeApp(input.wabaId);
      info = await graph.phoneNumber(input.phoneNumberId);
    } catch (err) {
      const appErr = toAppError(err);
      await this.saveError(companyId, appErr);
      logger.warn({ companyId, code: appErr.code }, 'WhatsApp connect failed');
      throw appErr;
    }
    const now = new Date();
    const values = {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      ...this.phoneFields(info),
      accessTokenEnc: encrypt(input.token),
      tokenSetAt: now,
      webhookSubscribedAt: now,
      connectedAt: now,
      connectedBy: input.by,
      connectMethod: input.method,
      status: 'connected' as const,
      lastError: null
    };
    const [row] = await this.db
      .insert(whatsappAccounts)
      .values({ companyId, ...values })
      .onConflictDoUpdate({ target: whatsappAccounts.companyId, set: values })
      .returning();
    return row;
  }

  private async embedded(companyId: string, code: string, wabaId: string, phoneNumberId: string, pin: string | undefined, by: string | null) {
    const p = await this.platform.get();
    if (!p.appId || !p.appSecret) throw new AppError('BAD_REQUEST', 'Set the Meta app id and app secret in platform settings first.');
    let token: string;
    try {
      token = await Graph.exchangeCode(p.graphVersion, p.appId, p.appSecret, code);
    } catch (err) {
      const appErr = toAppError(err);
      await this.saveError(companyId, appErr);
      throw appErr;
    }
    const usedPin = pin ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await this.connect(companyId, { wabaId, phoneNumberId, token, pin: usedPin, method: 'embedded_signup', by });
    return { row, usedPin, pinGenerated: !pin };
  }

  async connectEmbedded(
    s: Session,
    companyId: string,
    input: { code: string; wabaId: string; phoneNumberId: string; pin?: string }
  ): Promise<WhatsappConnectResponse> {
    const c = await this.companies.require(companyId);
    const { row, usedPin, pinGenerated } = await this.embedded(companyId, input.code, input.wabaId, input.phoneNumberId, input.pin, s.userId);
    await this.audit.log(s, companyId, {
      action: 'whatsapp.connected',
      targetType: 'whatsapp_account',
      targetId: row.id,
      summary: `Connected WhatsApp ${row.displayPhone ?? row.phoneNumberId} for ${c.name} (Embedded Signup)`
    });
    return {
      account: presentAccount(row),
      registrationPin: usedPin,
      note: pinGenerated
        ? 'The number was registered with this new two-step verification PIN. Smart Reply does not store it; give it to the business owner.'
        : 'The number was registered with the PIN you entered.'
    };
  }

  async connectManual(
    s: Session,
    companyId: string,
    input: { wabaId: string; phoneNumberId: string; accessToken: string; pin?: string }
  ): Promise<WhatsappConnectResponse> {
    const c = await this.companies.require(companyId);
    const row = await this.connect(companyId, {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      token: input.accessToken,
      pin: input.pin ?? null,
      method: 'manual',
      by: s.userId
    });
    await this.audit.log(s, companyId, {
      action: 'whatsapp.connected',
      targetType: 'whatsapp_account',
      targetId: row.id,
      summary: `Connected WhatsApp ${row.displayPhone ?? row.phoneNumberId} for ${c.name} (manual)`
    });
    return {
      account: presentAccount(row),
      registrationPin: null,
      note: input.pin ? 'The number was registered with the PIN you entered.' : 'The number was not re-registered (no PIN given).'
    };
  }

  private graphFor(a: AccountRow, version: string): Graph {
    const token = decrypt(a.accessTokenEnc);
    if (!token) throw new AppError('WHATSAPP_NOT_CONNECTED', 'No token is stored for this number.');
    return new Graph({ token, version });
  }

  async verify(s: Session, companyId: string): Promise<WhatsappAccountAdminView> {
    await this.companies.require(companyId);
    const a = await this.requireAccount(companyId);
    const { graphVersion } = await this.platform.get();
    try {
      const info = await this.graphFor(a, graphVersion).phoneNumber(a.phoneNumberId);
      await this.db
        .update(whatsappAccounts)
        .set({ ...this.phoneFields(info), status: a.status === 'disconnected' ? 'disconnected' : 'connected', lastError: null })
        .where(eq(whatsappAccounts.id, a.id));
    } catch (err) {
      const appErr = toAppError(err);
      await this.saveError(companyId, appErr);
      throw appErr;
    }
    await this.audit.log(s, companyId, { action: 'whatsapp.verified', targetType: 'whatsapp_account', targetId: a.id, summary: 'Re-checked the WhatsApp number' });
    return presentAccount(await this.account(companyId));
  }

  async subscribe(s: Session, companyId: string): Promise<WhatsappAccountAdminView> {
    await this.companies.require(companyId);
    const a = await this.requireAccount(companyId);
    const { graphVersion } = await this.platform.get();
    try {
      await this.graphFor(a, graphVersion).subscribeApp(a.wabaId);
    } catch (err) {
      const appErr = toAppError(err);
      await this.saveError(companyId, appErr);
      throw appErr;
    }
    await this.db.update(whatsappAccounts).set({ webhookSubscribedAt: new Date(), lastError: null }).where(eq(whatsappAccounts.id, a.id));
    await this.audit.log(s, companyId, { action: 'whatsapp.subscribed', targetType: 'whatsapp_account', targetId: a.id, summary: 'Re-subscribed the webhook' });
    return presentAccount(await this.account(companyId));
  }

  async disconnect(s: Session, companyId: string): Promise<WhatsappAccountAdminView> {
    await this.companies.require(companyId);
    const a = await this.requireAccount(companyId);
    const { graphVersion } = await this.platform.get();
    try {
      await this.graphFor(a, graphVersion).unsubscribeApp(a.wabaId);
    } catch (err) {
      logger.warn({ companyId, code: toAppError(err).code }, 'Unsubscribe failed while disconnecting; continuing');
    }
    await this.db.update(whatsappAccounts).set({ status: 'disconnected', webhookSubscribedAt: null }).where(eq(whatsappAccounts.id, a.id));
    await this.audit.log(s, companyId, {
      action: 'whatsapp.disconnected',
      targetType: 'whatsapp_account',
      targetId: a.id,
      summary: `Disconnected WhatsApp ${a.displayPhone ?? a.phoneNumberId}`
    });
    return presentAccount(await this.account(companyId));
  }

  /* ───────── One-time connect link ───────── */

  async createLink(s: Session, companyId: string): Promise<ConnectLinkResponse> {
    const c = await this.companies.require(companyId);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + LINK_HOURS * 3600_000);
    const [row] = await this.db.insert(connectLinks).values({ companyId, tokenHash: sha256(token), createdBy: s.userId, expiresAt }).returning({ id: connectLinks.id });
    await this.audit.log(s, companyId, {
      action: 'whatsapp.connect_link',
      targetType: 'connect_link',
      targetId: row.id,
      summary: `Created a one-time WhatsApp connect link for ${c.name} (valid ${LINK_HOURS} hours)`
    });
    return { url: `${env.APP_URL}/connect/${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() };
  }

  private async openLink(token: string) {
    if (!token || token.length > 200) throw new AppError('TOKEN_INVALID', 'This link has expired or was already used.');
    const [link] = await this.db
      .select({ l: connectLinks, companyName: companies.name, companyStatus: companies.status })
      .from(connectLinks)
      .innerJoin(companies, eq(companies.id, connectLinks.companyId))
      .where(and(eq(connectLinks.tokenHash, sha256(token)), isNull(connectLinks.usedAt), gt(connectLinks.expiresAt, new Date())))
      .limit(1);
    if (!link || link.companyStatus === 'closed') throw new AppError('TOKEN_INVALID', 'This link has expired or was already used. Ask LUMI AI for a new one.');
    return link;
  }

  async linkConfig(token: string): Promise<EmbeddedSignupConfig> {
    const link = await this.openLink(token);
    const p = await this.platform.get();
    return { appId: p.appId, configId: p.embeddedSignupConfigId, graphVersion: p.graphVersion, companyName: link.companyName };
  }

  async finishLink(token: string, input: { code: string; wabaId: string; phoneNumberId: string; pin?: string }): Promise<{ ok: true; displayPhone: string | null }> {
    const link = await this.openLink(token);
    // Claim the link first so it cannot be used twice in parallel.
    const [claimed] = await this.db
      .update(connectLinks)
      .set({ usedAt: new Date() })
      .where(and(eq(connectLinks.id, link.l.id), isNull(connectLinks.usedAt)))
      .returning({ id: connectLinks.id });
    if (!claimed) throw new AppError('TOKEN_INVALID', 'This link was already used.');
    let row: AccountRow;
    try {
      ({ row } = await this.embedded(link.l.companyId, input.code, input.wabaId, input.phoneNumberId, input.pin, link.l.createdBy));
    } catch (err) {
      // A failed attempt (expired code, wrong account) can be tried again with the same link.
      await this.db.update(connectLinks).set({ usedAt: null }).where(eq(connectLinks.id, link.l.id));
      throw err;
    }
    await this.systemAudit.system(link.l.companyId, {
      action: 'whatsapp.connected',
      targetType: 'whatsapp_account',
      targetId: row.id,
      summary: `Connected WhatsApp ${row.displayPhone ?? row.phoneNumberId} through the one-time connect link`
    });
    return { ok: true, displayPhone: row.displayPhone };
  }
}
