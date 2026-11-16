import { Global, Injectable, Module } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { env } from '../config';
import { decrypt } from '../common/crypto';
import { AppError } from '../common/errors';
import type { Db } from '../db/client';
import { platformSettings, whatsappAccounts } from '../db/schema';
import { InjectDb } from '../infra/db';
import { Graph } from './graph';

export interface PlatformSecrets {
  appId: string;
  appSecret: string | null;
  verifyToken: string | null;
  graphVersion: string;
  embeddedSignupConfigId: string;
  systemToken: string | null;
  subscribedFields: string[];
  ai: { provider: 'openai' | 'anthropic' | 'none'; apiKey: string | null; model: string; baseUrl: string; defaultPrompt: string; globalOff: boolean };
}

const TTL = 30_000;

/** Platform-wide Meta and AI settings, decrypted. Edited only by system admins. */
@Injectable()
export class Platform {
  private cache: { at: number; value: PlatformSecrets } | null = null;

  constructor(@InjectDb() private readonly db: Db) {}

  invalidate(): void {
    this.cache = null;
  }

  async row() {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing().returning();
    if (created) return created;
    const [again] = await this.db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    return again!;
  }

  async get(): Promise<PlatformSecrets> {
    if (this.cache && Date.now() - this.cache.at < TTL) return this.cache.value;
    const r = await this.row();
    const value: PlatformSecrets = {
      appId: r.metaAppId || env.META_APP_ID,
      appSecret: decrypt(r.metaAppSecretEnc) ?? (env.META_APP_SECRET || null),
      verifyToken: decrypt(r.metaVerifyTokenEnc) ?? (env.META_VERIFY_TOKEN || null),
      graphVersion: r.metaGraphVersion || env.META_GRAPH_VERSION,
      embeddedSignupConfigId: r.metaEmbeddedSignupConfigId,
      systemToken: decrypt(r.metaSystemTokenEnc),
      subscribedFields: r.metaSubscribedFields,
      ai: {
        provider: r.aiProvider,
        apiKey: decrypt(r.aiApiKeyEnc),
        model: r.aiDefaultModel,
        baseUrl: r.aiBaseUrl,
        defaultPrompt: r.aiDefaultPrompt,
        globalOff: r.aiGlobalOff
      }
    };
    this.cache = { at: Date.now(), value };
    return value;
  }
}

export interface CompanyWhatsapp {
  account: typeof whatsappAccounts.$inferSelect;
  graph: Graph;
  phoneNumberId: string;
  wabaId: string;
}

/** The connected WhatsApp number of a company and a Graph client with its token. */
@Injectable()
export class WhatsappAccounts {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform
  ) {}

  async find(companyId: string): Promise<CompanyWhatsapp | null> {
    const [account] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId)).limit(1);
    if (!account || account.status === 'disconnected') return null;
    const token = decrypt(account.accessTokenEnc);
    if (!token) return null;
    const { graphVersion } = await this.platform.get();
    return { account, graph: new Graph({ token, version: graphVersion }), phoneNumberId: account.phoneNumberId, wabaId: account.wabaId };
  }

  async require(companyId: string): Promise<CompanyWhatsapp> {
    const wa = await this.find(companyId);
    if (!wa) throw new AppError('WHATSAPP_NOT_CONNECTED', 'WhatsApp is not connected yet. LUMI AI connects your number.');
    return wa;
  }

  async byPhoneNumberId(phoneNumberId: string): Promise<typeof whatsappAccounts.$inferSelect | null> {
    const [account] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.phoneNumberId, phoneNumberId)).limit(1);
    return account ?? null;
  }
}

@Global()
@Module({ providers: [Platform, WhatsappAccounts], exports: [Platform, WhatsappAccounts] })
export class MetaModule {}
