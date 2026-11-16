import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  DEFAULT_STAFF_PERMISSIONS,
  LoginResponse,
  MeResponse,
  STAFF_PERMISSIONS,
  StaffPermissions,
  UpdateMeInput,
  initialsOf
} from '@smart-reply/shared';
import { env } from '../../config';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import type { Session } from '../../common/session';
import { SessionLoader } from '../../common/session-loader';
import { signAccessToken } from '../../common/tokens';
import type { Db } from '../../db/client';
import {
  aiAddons,
  companies,
  devices,
  impersonations,
  invites,
  passwordResets,
  plans,
  presence,
  refreshTokens,
  users,
  whatsappAccounts
} from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Mailer, emailLayout } from '../../infra/mailer';
import { Realtime } from '../../infra/realtime';
import { Audit } from '../../common/audit';

export const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (p: string): Promise<string> => hash(p, ARGON_OPTS);

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const ALL_ON = Object.fromEntries(STAFF_PERMISSIONS.map(p => [p, true])) as StaffPermissions;
// A real hash so failed logins for unknown emails take the same time.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zx2bXt2OmlwvJ2hOtvZDu4fzAz5g2Ak4FO3L5rhYxT0';

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly sessions: SessionLoader,
    private readonly mailer: Mailer,
    private readonly realtime: Realtime,
    private readonly audit: Audit
  ) {}

  async issue(userId: string, tokenVersion: number, client: 'web' | 'mobile', device: string, impersonationId: string | null = null): Promise<IssuedTokens> {
    const { token, expiresAt } = await signAccessToken({ sub: userId, tv: tokenVersion, imp: impersonationId, cl: client });
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: sha256(refreshToken),
      device: `${client}:${device}`.slice(0, 160),
      impersonationId,
      expiresAt: refreshExpiresAt
    });
    return { accessToken: token, accessExpiresAt: expiresAt, refreshToken, refreshExpiresAt };
  }

  async login(email: string, password: string, client: 'web' | 'mobile', device: string): Promise<{ tokens: IssuedTokens; me: MeResponse }> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    const ok = await verify(u?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
    if (!u || !u.passwordHash || !ok) throw new AppError('INVALID_CREDENTIALS', 'Email or password is wrong.');
    if (u.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'This account is disabled. Ask your manager.');
    if (u.companyId) {
      const [c] = await this.db.select({ status: companies.status }).from(companies).where(eq(companies.id, u.companyId)).limit(1);
      if (c?.status !== 'active') throw new AppError('COMPANY_SUSPENDED', 'This company account is suspended. Contact LUMI AI.');
    }
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
    const tokens = await this.issue(u.id, u.tokenVersion, client, device);
    const session = await this.sessions.load({ sub: u.id, tv: u.tokenVersion, imp: null, cl: client });
    return { tokens, me: await this.me(session) };
  }

  /** Rotates the refresh token. Reuse of an already-rotated token revokes the whole family. */
  async refresh(refreshToken: string, client: 'web' | 'mobile'): Promise<{ tokens: IssuedTokens; me: MeResponse }> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(refreshToken))).limit(1);
    if (!row || row.expiresAt < new Date()) throw new AppError('TOKEN_INVALID', 'Sign in again.');
    if (row.revokedAt) {
      // Someone replayed an old token: end every session of this user.
      await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      throw new AppError('TOKEN_INVALID', 'Sign in again.');
    }
    const [u] = await this.db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!u || u.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'This account is disabled.');
    const device = row.device.replace(/^(web|mobile):/, '');
    const tokens = await this.issue(u.id, u.tokenVersion, client, device, row.impersonationId);
    const [next] = await this.db.select({ id: refreshTokens.id }).from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(tokens.refreshToken))).limit(1);
    await this.db.update(refreshTokens).set({ revokedAt: new Date(), replacedBy: next?.id ?? null }).where(eq(refreshTokens.id, row.id));
    const session = await this.sessions.load({ sub: u.id, tv: u.tokenVersion, imp: row.impersonationId, cl: client });
    return { tokens, me: await this.me(session) };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  }

  async me(s: Session): Promise<MeResponse> {
    const [u] = await this.db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u) throw new AppError('UNAUTHENTICATED', 'Sign in again.');
    let company: MeResponse['company'] = null;
    let features: MeResponse['features'] = { aiAddon: false, calling: false, whatsappConnected: false };
    if (s.companyId) {
      const [c] = await this.db
        .select({ c: companies, planName: plans.name })
        .from(companies)
        .leftJoin(plans, eq(plans.id, companies.planId))
        .where(eq(companies.id, s.companyId))
        .limit(1);
      const [wa] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, s.companyId)).limit(1);
      const [ai] = await this.db.select({ status: aiAddons.status }).from(aiAddons).where(eq(aiAddons.companyId, s.companyId)).limit(1);
      if (c) {
        company = {
          id: c.c.id,
          name: c.c.name,
          slug: c.c.slug,
          status: c.c.status,
          timezone: c.c.timezone,
          seatLimit: c.c.seatLimit,
          planName: c.planName,
          displayPhone: wa?.displayPhone ?? null
        };
      }
      features = {
        aiAddon: ai?.status === 'active',
        calling: Boolean(wa?.callingEnabled),
        whatsappConnected: wa?.status === 'connected'
      };
    }
    let impersonation: MeResponse['impersonation'] = null;
    if (s.impersonationId && s.adminUserId) {
      const [imp] = await this.db.select().from(impersonations).where(eq(impersonations.id, s.impersonationId)).limit(1);
      const [admin] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, s.adminUserId)).limit(1);
      impersonation = { adminName: admin?.name ?? 'LUMI AI', reason: imp?.reason ?? '' };
    }
    return {
      user: {
        id: u.id,
        role: u.role,
        name: u.name,
        initials: u.initials,
        title: u.title,
        email: u.email,
        phone: u.phone,
        language: u.language,
        signature: u.signature,
        avatarColor: u.avatarColor,
        notify: u.notify
      },
      company,
      permissions: s.role === 'staff' ? s.permissions : s.role === 'manager' ? ALL_ON : { ...DEFAULT_STAFF_PERMISSIONS },
      features,
      impersonation
    };
  }

  async updateMe(s: Session, input: UpdateMeInput): Promise<MeResponse> {
    const [u] = await this.db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u) throw new AppError('UNAUTHENTICATED', 'Sign in again.');
    await this.db
      .update(users)
      .set({
        ...(input.name ? { name: input.name, initials: initialsOf(input.name) } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.language ? { language: input.language } : {}),
        ...(input.signature !== undefined ? { signature: input.signature } : {}),
        ...(input.notify ? { notify: { ...u.notify, ...input.notify } } : {})
      })
      .where(eq(users.id, s.userId));
    this.sessions.invalidate(s.userId);
    return this.me(s);
  }

  async changePassword(s: Session, current: string, next: string): Promise<void> {
    const [u] = await this.db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u?.passwordHash || !(await verify(u.passwordHash, current).catch(() => false))) {
      throw new AppError('INVALID_CREDENTIALS', 'Your current password is wrong.');
    }
    await this.db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, u.id));
    // Other devices must sign in again; this device keeps working until its refresh.
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
    await this.audit.log(s, { action: 'user.password_changed', targetType: 'user', targetId: u.id, summary: `${u.name} changed their password` });
  }

  async forgotPassword(email: string): Promise<{ sent: boolean }> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!u || u.status !== 'active') return { sent: true };
    const token = randomToken(32);
    await this.db.insert(passwordResets).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailer.send(
      u.email,
      'Reset your Smart Reply password',
      `Open this link to choose a new password (valid for 1 hour): ${url}`,
      emailLayout('Reset your password', [`Hi ${u.name},`, 'Use the button below to choose a new password. The link works for one hour.'], { label: 'Choose a new password', url })
    );
    return { sent: true };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const [r] = await this.db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
      .limit(1);
    if (!r) throw new AppError('TOKEN_INVALID', 'This reset link has expired. Ask for a new one.');
    await this.db.transaction(async tx => {
      await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
      const [u] = await tx.select().from(users).where(eq(users.id, r.userId)).limit(1);
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(password), tokenVersion: (u?.tokenVersion ?? 0) + 1 })
        .where(eq(users.id, r.userId));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, r.userId), isNull(refreshTokens.revokedAt)));
    });
    this.sessions.invalidate(r.userId);
    this.realtime.disconnectUser(r.userId);
  }

  async inviteInfo(token: string): Promise<{ name: string; email: string; companyName: string; role: string }> {
    const inv = await this.openInvite(token);
    const [c] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, inv.companyId)).limit(1);
    return { name: inv.name, email: inv.email, companyName: c?.name ?? '', role: inv.role };
  }

  private async openInvite(token: string) {
    const [inv] = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.acceptedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, new Date())))
      .limit(1);
    if (!inv) throw new AppError('TOKEN_INVALID', 'This invite link has expired or was already used. Ask your manager for a new one.');
    return inv;
  }

  async acceptInvite(token: string, password: string, name: string | undefined, client: 'web' | 'mobile'): Promise<{ tokens: IssuedTokens; me: MeResponse }> {
    const inv = await this.openInvite(token);
    const [existing] = await this.db.select().from(users).where(eq(users.email, inv.email)).limit(1);
    if (existing && existing.status !== 'invited') throw new AppError('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead.');
    const userId = existing?.id ?? uuidv7();
    const finalName = name?.trim() || inv.name;
    await this.db.transaction(async tx => {
      if (existing) {
        await tx
          .update(users)
          .set({ name: finalName, initials: initialsOf(finalName), passwordHash: await hashPassword(password), status: 'active' })
          .where(eq(users.id, existing.id));
      } else {
        await tx.insert(users).values({
          id: userId,
          companyId: inv.companyId,
          role: inv.role,
          name: finalName,
          initials: initialsOf(finalName),
          title: inv.title,
          email: inv.email,
          phone: inv.phone,
          passwordHash: await hashPassword(password),
          status: 'active',
          avatarColor: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'][Math.floor(Math.random() * 7)]
        });
      }
      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
      for (const channel of ['call', 'chat'] as const) {
        await tx.insert(presence).values({ userId, channel, companyId: inv.companyId, status: 'available' }).onConflictDoNothing();
      }
    });
    await this.audit.system(inv.companyId, { action: 'staff.joined', targetType: 'user', targetId: userId, summary: `${finalName} accepted the invite` });
    return this.login(inv.email, password, client, 'invite');
  }

  async registerDevice(s: Session, platform: 'android' | 'ios' | 'web', pushToken: string, voipToken?: string): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(devices)
      .values({ userId: s.userId, platform, pushToken, voipToken: voipToken ?? null })
      .onConflictDoUpdate({ target: devices.pushToken, set: { userId: s.userId, platform, voipToken: voipToken ?? null, lastSeenAt: new Date() } })
      .returning({ id: devices.id });
    return row;
  }

  async removeDevice(s: Session, id: string): Promise<void> {
    await this.db.delete(devices).where(and(eq(devices.id, id), eq(devices.userId, s.userId)));
  }

  /** Ends a support session and gives the system admin their own session back. */
  async endImpersonation(s: Session, client: 'web' | 'mobile'): Promise<{ tokens: IssuedTokens; me: MeResponse }> {
    if (!s.impersonationId || !s.adminUserId) throw new AppError('BAD_REQUEST', 'Not in a support session.');
    await this.db.update(impersonations).set({ endedAt: new Date() }).where(eq(impersonations.id, s.impersonationId));
    await this.audit.log(s, { action: 'support.ended', targetType: 'company', targetId: s.companyId, summary: 'Support session ended' });
    const [admin] = await this.db.select().from(users).where(eq(users.id, s.adminUserId)).limit(1);
    if (!admin) throw new AppError('UNAUTHENTICATED', 'Sign in again.');
    const tokens = await this.issue(admin.id, admin.tokenVersion, client, 'admin');
    const session = await this.sessions.load({ sub: admin.id, tv: admin.tokenVersion, imp: null, cl: client });
    return { tokens, me: await this.me(session) };
  }

  toLoginResponse(result: { tokens: IssuedTokens; me: MeResponse }, client: 'web' | 'mobile'): LoginResponse {
    return client === 'mobile'
      ? {
          me: result.me,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessExpiresAt: result.tokens.accessExpiresAt.toISOString()
          }
        }
      : { me: result.me };
  }
}
