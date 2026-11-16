import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import {
  DEFAULT_STAFF_PERMISSIONS,
  MAX_SEATS,
  avatarColorFor,
  initialsOf,
  normalizePhone
} from '@smart-reply/shared';
import type {
  AdminCompany,
  AdminCompanyCreated,
  AdminCompanyUser,
  Invite,
  MeResponse,
  addManagerSchema,
  createCompanySchema,
  updateCompanySchema
} from '@smart-reply/shared';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError, notFound } from '../../common/errors';
import type { Session } from '../../common/session';
import { SessionLoader } from '../../common/session-loader';
import { env } from '../../config';
import type { Db, DbOrTx } from '../../db/client';
import {
  aiAddons,
  aiBotSettings,
  assignmentRules,
  businessProfiles,
  callSettings,
  companies,
  impersonations,
  invites,
  ivrMenus,
  messages,
  plans,
  presence,
  rolePermissions,
  users,
  whatsappAccounts
} from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Mailer, emailLayout } from '../../infra/mailer';
import { Realtime } from '../../infra/realtime';
import { Platform } from '../../meta/platform';
import { AuthService, IssuedTokens, hashPassword } from '../auth/auth.service';
import { AdminAudit } from './admin.audit';

const INVITE_DAYS = 7;
const UUID = /^[0-9a-f-]{36}$/i;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return base.length >= 2 ? base : `company-${base || 'x'}`.slice(0, 50);
}

export function assertUuid(id: string, what: string): void {
  if (!UUID.test(id)) throw notFound(what);
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AdminAudit,
    private readonly mailer: Mailer,
    private readonly platform: Platform,
    private readonly auth: AuthService,
    private readonly sessions: SessionLoader,
    private readonly realtime: Realtime
  ) {}

  /* ───────── Read ───────── */

  async require(id: string) {
    assertUuid(id, 'Company');
    const [c] = await this.db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!c) throw notFound('Company');
    return c;
  }

  /** Active and invited people plus open invites. */
  async seatsUsed(companyId: string, tx?: DbOrTx): Promise<number> {
    return (await this.seatsByCompany([companyId], tx)).get(companyId) ?? 0;
  }

  private async seatsByCompany(ids: string[], tx?: DbOrTx): Promise<Map<string, number>> {
    const db = tx ?? this.db;
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const u = await db
      .select({ companyId: users.companyId, n: count() })
      .from(users)
      .where(and(inArray(users.companyId, ids), inArray(users.status, ['active', 'invited']), ne(users.role, 'system_admin')))
      .groupBy(users.companyId);
    const i = await db
      .select({ companyId: invites.companyId, n: count() })
      .from(invites)
      .where(and(inArray(invites.companyId, ids), isNull(invites.acceptedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, new Date())))
      .groupBy(invites.companyId);
    for (const r of u) if (r.companyId) out.set(r.companyId, (out.get(r.companyId) ?? 0) + Number(r.n));
    for (const r of i) out.set(r.companyId, (out.get(r.companyId) ?? 0) + Number(r.n));
    return out;
  }

  async present(ids?: string[]): Promise<AdminCompany[]> {
    const rows = await this.db
      .select({ c: companies, planName: plans.name })
      .from(companies)
      .leftJoin(plans, eq(plans.id, companies.planId))
      .where(ids ? inArray(companies.id, ids) : undefined)
      .orderBy(asc(companies.name));
    const list = rows.map(r => r.c.id);
    if (list.length === 0) return [];
    const seats = await this.seatsByCompany(list);
    const managers = await this.db
      .select({ companyId: users.companyId, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.companyId, list), eq(users.role, 'manager'), ne(users.status, 'disabled')))
      .orderBy(asc(users.createdAt), asc(users.id));
    const firstManager = new Map<string, { name: string; email: string }>();
    for (const m of managers) if (m.companyId && !firstManager.has(m.companyId)) firstManager.set(m.companyId, m);
    const wa = await this.db.select().from(whatsappAccounts).where(inArray(whatsappAccounts.companyId, list));
    const waBy = new Map(wa.map(w => [w.companyId, w]));
    const ai = await this.db.select({ companyId: aiAddons.companyId, status: aiAddons.status, activeUntil: aiAddons.activeUntil }).from(aiAddons).where(inArray(aiAddons.companyId, list));
    const aiBy = new Map(ai.map(a => [a.companyId, a]));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const msgs = await this.db
      .select({ companyId: messages.companyId, n: count() })
      .from(messages)
      .where(and(inArray(messages.companyId, list), inArray(messages.direction, ['in', 'out']), gt(messages.createdAt, since)))
      .groupBy(messages.companyId);
    const msgBy = new Map(msgs.map(m => [m.companyId, Number(m.n)]));

    return rows.map(({ c, planName }) => {
      const w = waBy.get(c.id);
      const a = aiBy.get(c.id);
      const m = firstManager.get(c.id);
      const aiStatus = !a ? 'off' : a.status === 'active' && a.activeUntil && a.activeUntil.getTime() <= Date.now() ? 'expired' : a.status;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        planId: c.planId,
        planName,
        seatLimit: c.seatLimit,
        seatsUsed: seats.get(c.id) ?? 0,
        timezone: c.timezone,
        managerName: m?.name ?? null,
        managerEmail: m?.email ?? null,
        whatsapp: { connected: w?.status === 'connected', displayPhone: w?.displayPhone ?? null, qualityRating: w?.qualityRating ?? null },
        aiStatus,
        createdAt: c.createdAt.toISOString(),
        messages30d: msgBy.get(c.id) ?? 0
      };
    });
  }

  async one(id: string): Promise<AdminCompany> {
    await this.require(id);
    const [c] = await this.present([id]);
    return c!;
  }

  async users(id: string): Promise<AdminCompanyUser[]> {
    await this.require(id);
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.companyId, id))
      .orderBy(asc(users.role), asc(users.name));
    return rows
      .filter((u): u is typeof u & { role: 'manager' | 'staff' } => u.role !== 'system_admin')
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }));
  }

  /* ───────── Create ───────── */

  private async uniqueSlug(wanted: string, tx: DbOrTx): Promise<string> {
    const base = wanted.slice(0, 55);
    const taken = await tx
      .select({ slug: companies.slug })
      .from(companies)
      .where(or(eq(companies.slug, base), sql`${companies.slug} like ${`${base}-%`}`));
    const set = new Set(taken.map(t => t.slug));
    if (!set.has(base)) return base;
    for (let n = 2; n < 10_000; n++) if (!set.has(`${base}-${n}`)) return `${base}-${n}`;
    return `${base}-${uuidv7().slice(-6)}`;
  }

  private async assertEmailFree(email: string, tx: DbOrTx): Promise<void> {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (u) throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.');
    const [i] = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, new Date())))
      .limit(1);
    if (i) throw new AppError('EMAIL_TAKEN', 'This email already has an open invite.');
  }

  private async createInvite(
    tx: DbOrTx,
    companyId: string,
    person: { name: string; email: string; phone?: string },
    invitedBy: string
  ): Promise<{ row: typeof invites.$inferSelect; link: string }> {
    const token = randomToken(32);
    const [row] = await tx
      .insert(invites)
      .values({
        companyId,
        name: person.name,
        email: person.email,
        phone: person.phone ? normalizePhone(person.phone) : null,
        title: 'Manager',
        role: 'manager',
        tokenHash: sha256(token),
        invitedBy,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000)
      })
      .returning();
    return { row, link: `${env.APP_URL}/invite/${encodeURIComponent(token)}` };
  }

  async create(s: Session, input: z.infer<typeof createCompanySchema>): Promise<AdminCompanyCreated> {
    let plan: typeof plans.$inferSelect | undefined;
    if (input.planId) {
      [plan] = await this.db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
      if (!plan) throw notFound('Plan');
    }
    const seatLimit = Math.min(input.seatLimit ?? plan?.seatLimit ?? 5, MAX_SEATS);
    const { defaultPrompt } = (await this.platform.get()).ai;
    const passwordHash = input.manager.password ? await hashPassword(input.manager.password) : null;
    const companyId = uuidv7();
    let inviteLink: string | undefined;
    let managerId: string | null = null;

    await this.db.transaction(async tx => {
      await this.assertEmailFree(input.manager.email, tx);
      const slug = input.slug ? input.slug : await this.uniqueSlug(slugify(input.name), tx);
      if (input.slug) {
        const [taken] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.slug, input.slug)).limit(1);
        if (taken) throw new AppError('CONFLICT', 'Another company already uses this short name.');
      }
      await tx.insert(companies).values({
        id: companyId,
        name: input.name,
        slug,
        planId: input.planId,
        seatLimit,
        timezone: input.timezone,
        createdBy: s.userId
      });
      await tx.insert(rolePermissions).values({ companyId, staff: { ...DEFAULT_STAFF_PERMISSIONS } });
      await tx.insert(callSettings).values({ companyId, hours: { enabled: false, timezone: input.timezone, weekly: [], holidays: [] } });
      await tx.insert(assignmentRules).values({ companyId });
      await tx.insert(businessProfiles).values({ companyId, displayName: input.name });
      await tx.insert(ivrMenus).values({ companyId });
      await tx.insert(aiAddons).values({ companyId, status: 'off' });
      await tx.insert(aiBotSettings).values({ companyId, systemPrompt: defaultPrompt });

      if (passwordHash) {
        const [u] = await tx
          .insert(users)
          .values({
            companyId,
            role: 'manager',
            name: input.manager.name,
            initials: initialsOf(input.manager.name),
            title: 'Manager',
            email: input.manager.email,
            phone: input.manager.phone ? normalizePhone(input.manager.phone) : null,
            passwordHash,
            status: 'active',
            avatarColor: avatarColorFor(input.manager.email)
          })
          .returning({ id: users.id });
        managerId = u.id;
        for (const channel of ['call', 'chat'] as const) {
          await tx.insert(presence).values({ userId: u.id, channel, companyId, status: 'available' }).onConflictDoNothing();
        }
      } else {
        const inv = await this.createInvite(tx, companyId, input.manager, s.userId);
        inviteLink = inv.link;
      }
      await this.audit.log(
        s,
        null,
        { action: 'company.created', targetType: 'company', targetId: companyId, summary: `Created company ${input.name} (${seatLimit} seats)` },
        tx
      );
      await this.audit.log(
        s,
        companyId,
        {
          action: managerId ? 'manager.created' : 'manager.invited',
          targetType: 'user',
          targetId: managerId,
          summary: `${managerId ? 'Created' : 'Invited'} manager ${input.manager.name}`
        },
        tx
      );
    });

    const loginUrl = `${env.APP_URL}/login`;
    if (inviteLink) {
      await this.mailer.send(
        input.manager.email,
        `Your Smart Reply account for ${input.name}`,
        `LUMI AI set up Smart Reply for ${input.name}. Open this link to set your password (valid for ${INVITE_DAYS} days): ${inviteLink}`,
        emailLayout(
          'Welcome to Smart Reply',
          [`Hi ${input.manager.name},`, `LUMI AI set up Smart Reply for ${input.name}. You are the manager.`, `Set your password with the button below. The link works for ${INVITE_DAYS} days.`],
          { label: 'Set my password', url: inviteLink }
        )
      );
    } else {
      await this.mailer.send(
        input.manager.email,
        `Your Smart Reply account for ${input.name}`,
        `LUMI AI set up Smart Reply for ${input.name}. Sign in at ${loginUrl} with this email and the password LUMI AI gave you.`,
        emailLayout(
          'Welcome to Smart Reply',
          [`Hi ${input.manager.name},`, `LUMI AI set up Smart Reply for ${input.name}. You are the manager.`, 'Sign in with this email and the password LUMI AI gave you.'],
          { label: 'Sign in', url: loginUrl }
        )
      );
    }
    return { company: await this.one(companyId), ...(inviteLink ? { managerInviteLink: inviteLink } : {}) };
  }

  /* ───────── Change ───────── */

  async update(s: Session, id: string, input: z.infer<typeof updateCompanySchema>): Promise<AdminCompany> {
    const c = await this.require(id);
    if (input.planId) {
      const [plan] = await this.db.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId)).limit(1);
      if (!plan) throw notFound('Plan');
    }
    if (input.seatLimit !== undefined && input.seatLimit < c.seatLimit) {
      const used = await this.seatsUsed(id);
      if (input.seatLimit < used) {
        throw new AppError('CONFLICT', `${used} seats are in use. Remove people or cancel invites before lowering the limit to ${input.seatLimit}.`);
      }
    }
    await this.db
      .update(companies)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.planId !== undefined ? { planId: input.planId } : {}),
        ...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      })
      .where(eq(companies.id, id));
    const changes = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
    await this.audit.log(s, id, { action: 'company.updated', targetType: 'company', targetId: id, summary: `Company settings changed (${changes || 'no changes'})` });
    if (input.status && input.status !== 'active' && c.status === 'active') await this.signOutEveryone(id);
    return this.one(id);
  }

  private async signOutEveryone(companyId: string): Promise<void> {
    const rows = await this.db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId));
    for (const u of rows) {
      this.sessions.invalidate(u.id);
      this.realtime.disconnectUser(u.id);
    }
  }

  async setStatus(s: Session, id: string, status: 'active' | 'suspended'): Promise<AdminCompany> {
    const c = await this.require(id);
    if (c.status !== status) {
      await this.db.update(companies).set({ status }).where(eq(companies.id, id));
      if (status === 'suspended') await this.signOutEveryone(id);
      else for (const u of await this.db.select({ id: users.id }).from(users).where(eq(users.companyId, id))) this.sessions.invalidate(u.id);
    }
    await this.audit.log(s, id, {
      action: status === 'suspended' ? 'company.suspended' : 'company.activated',
      targetType: 'company',
      targetId: id,
      summary: status === 'suspended' ? `Access suspended for ${c.name}` : `Access resumed for ${c.name}`
    });
    return this.one(id);
  }

  async addManager(s: Session, id: string, input: z.infer<typeof addManagerSchema>): Promise<Invite> {
    const c = await this.require(id);
    const inv = await this.db.transaction(async tx => {
      await this.assertEmailFree(input.email, tx);
      const used = await this.seatsUsed(id, tx);
      if (used >= c.seatLimit) throw new AppError('SEAT_LIMIT_REACHED', `All ${c.seatLimit} seats are in use. Raise the seat limit first.`);
      const created = await this.createInvite(tx, id, input, s.userId);
      await this.audit.log(s, id, { action: 'manager.invited', targetType: 'invite', targetId: created.row.id, summary: `Invited manager ${input.name}` }, tx);
      return created;
    });
    await this.mailer.send(
      input.email,
      `You are a manager of ${c.name} on Smart Reply`,
      `Open this link to set your password (valid for ${INVITE_DAYS} days): ${inv.link}`,
      emailLayout('You are invited to Smart Reply', [`Hi ${input.name},`, `LUMI AI added you as a manager of ${c.name}.`], { label: 'Set my password', url: inv.link })
    );
    return {
      id: inv.row.id,
      name: inv.row.name,
      email: inv.row.email,
      phone: inv.row.phone,
      role: inv.row.role,
      title: inv.row.title,
      expiresAt: inv.row.expiresAt.toISOString(),
      createdAt: inv.row.createdAt.toISOString(),
      link: inv.link
    };
  }

  /* ───────── Support session ───────── */

  async impersonate(s: Session, id: string, reason: string, client: 'web' | 'mobile'): Promise<{ tokens: IssuedTokens; me: MeResponse }> {
    const c = await this.require(id);
    const [admin] = await this.db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!admin || admin.role !== 'system_admin') throw new AppError('FORBIDDEN', 'Only LUMI AI admins can open a support session.');
    const [manager] = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.companyId, id), eq(users.role, 'manager'), eq(users.status, 'active')))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1);
    if (!manager) throw new AppError('CONFLICT', 'This company has no active manager yet. A support session acts as its manager.');
    const [imp] = await this.db.insert(impersonations).values({ adminUserId: admin.id, companyId: id, asUserId: manager.id, reason }).returning();
    await this.audit.log(s, null, { action: 'support.started', targetType: 'company', targetId: id, summary: `Support session for ${c.name}: ${reason}` });
    await this.audit.log(s, id, {
      action: 'support.started',
      targetType: 'company',
      targetId: id,
      summary: `LUMI AI support opened a session as ${manager.name}: ${reason}`,
      meta: { impersonationId: imp.id }
    });
    const tokens = await this.auth.issue(admin.id, admin.tokenVersion, client, 'support', imp.id);
    const session = await this.sessions.load({ sub: admin.id, tv: admin.tokenVersion, imp: imp.id, cl: client });
    return { tokens, me: await this.auth.me(session) };
  }
}
