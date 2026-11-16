import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  CreateInviteInput,
  DEFAULT_STAFF_PERMISSIONS,
  Invite,
  MAX_SEATS,
  PresenceInput,
  RolesResponse,
  STAFF_PERMISSIONS,
  SeatsResponse,
  StaffBrief,
  StaffMember,
  StaffPermissions,
  StaffSummary,
  UpdateStaffInput,
  initialsOf
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError, notFound } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { SessionLoader } from '../../common/session-loader';
import { env } from '../../config';
import { InboxService } from '../../core/inbox.service';
import type { Db, DbOrTx } from '../../db/client';
import {
  calls,
  companies,
  contacts,
  conversations,
  invites,
  messages,
  plans,
  refreshTokens,
  rolePermissions,
  staffTargets,
  userPermissions,
  users
} from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Mailer, emailLayout } from '../../infra/mailer';
import { Realtime, rooms } from '../../infra/realtime';
import { PresenceMap, PresenceService } from './presence.service';
import { dayRange, startOfLocalWeek } from './time';

type UserRow = typeof users.$inferSelect;
type InviteRow = typeof invites.$inferSelect;

const INVITE_DAYS = 7;
const ALL_ON = Object.fromEntries(STAFF_PERMISSIONS.map(p => [p, true])) as StaffPermissions;
const COMPANY_ROLES: ('manager' | 'staff')[] = ['manager', 'staff'];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function companyRole(role: UserRow['role']): 'manager' | 'staff' {
  return role === 'manager' ? 'manager' : 'staff';
}

@Injectable()
export class TeamService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly presence: PresenceService,
    private readonly realtime: Realtime,
    private readonly sessions: SessionLoader,
    private readonly mailer: Mailer,
    private readonly audit: Audit
  ) {}

  /* ───────── Loading ───────── */

  /** A manager or staff member of the company, or NOT_FOUND. */
  async member(companyId: string, id: string, tx?: DbOrTx): Promise<UserRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Staff member');
    const [u] = await (tx ?? this.db)
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.companyId, companyId), inArray(users.role, COMPANY_ROLES)))
      .limit(1);
    if (!u) throw notFound('Staff member');
    return u;
  }

  private async company(companyId: string, tx?: DbOrTx) {
    const [c] = await (tx ?? this.db).select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!c) throw notFound('Company');
    return c;
  }

  async rolePermissions(companyId: string, tx?: DbOrTx): Promise<StaffPermissions> {
    const [role] = await (tx ?? this.db).select().from(rolePermissions).where(eq(rolePermissions.companyId, companyId)).limit(1);
    return { ...DEFAULT_STAFF_PERMISSIONS, ...(role?.staff ?? {}) };
  }

  /* ───────── Presenters ───────── */

  private brief(u: UserRow, p: PresenceMap): StaffBrief {
    return {
      id: u.id,
      role: companyRole(u.role),
      name: u.name,
      initials: u.initials,
      title: u.title,
      avatarColor: u.avatarColor,
      presence: p
    };
  }

  async presentMembers(companyId: string, rows: UserRow[]): Promise<StaffMember[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.id);
    const tz = (await this.company(companyId)).timezone;
    const today = dayRange(tz);
    const weekStart = startOfLocalWeek(tz);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);

    const [presenceBy, breaks, base, overrides, targets] = await Promise.all([
      this.presence.presenceOf(companyId, ids),
      this.presence.breaksFor(companyId, ids),
      this.rolePermissions(companyId),
      this.db.select().from(userPermissions).where(and(eq(userPermissions.companyId, companyId), inArray(userPermissions.userId, ids))),
      this.db.select().from(staffTargets).where(and(eq(staffTargets.companyId, companyId), inArray(staffTargets.userId, ids)))
    ]);

    const open = await this.db
      .select({ owner: contacts.ownerUserId, n: count() })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(
        and(
          eq(conversations.companyId, companyId),
          eq(conversations.status, 'open'),
          isNotNull(conversations.lastMessageAt),
          inArray(contacts.ownerUserId, ids)
        )
      )
      .groupBy(contacts.ownerUserId);

    const firstIn = sql`(select min(${messages.createdAt}) from ${messages} where ${messages.conversationId} = ${conversations.id} and ${messages.direction} = 'in')`;
    const reply = await this.db
      .select({
        owner: contacts.ownerUserId,
        avg: sql<string | null>`avg(extract(epoch from (${conversations.firstResponseAt} - ${firstIn})))`
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(
        and(
          eq(conversations.companyId, companyId),
          gte(conversations.firstResponseAt, weekAgo),
          inArray(contacts.ownerUserId, ids),
          sql`${firstIn} <= ${conversations.firstResponseAt}`
        )
      )
      .groupBy(contacts.ownerUserId);

    const callsToday = await this.db
      .select({ handledBy: calls.handledByUserId, ringing: calls.ringingUserIds, outcome: calls.outcome })
      .from(calls)
      .where(and(eq(calls.companyId, companyId), gte(calls.startedAt, today.from), sql`${calls.startedAt} < ${today.to}`));

    const resolved = await this.db
      .select({ by: conversations.resolvedBy, n: count() })
      .from(conversations)
      .where(
        and(
          eq(conversations.companyId, companyId),
          eq(conversations.status, 'resolved'),
          gte(conversations.resolvedAt, weekStart),
          inArray(conversations.resolvedBy, ids)
        )
      )
      .groupBy(conversations.resolvedBy);

    const openBy = new Map(open.map(o => [o.owner, Number(o.n)]));
    const replyBy = new Map(reply.map(r => [r.owner, r.avg === null ? null : Math.round(Number(r.avg))]));
    const resolvedBy = new Map(resolved.map(r => [r.by, Number(r.n)]));
    const overrideBy = new Map(overrides.map(o => [o.userId, o.overrides]));
    const targetBy = new Map(targets.map(t => [t.userId, t.resolvedTarget]));

    return rows.map(u => {
      const handled = callsToday.filter(c => c.handledBy === u.id).length;
      const missed = callsToday.filter(c => c.outcome === 'missed' && (c.handledBy === u.id || c.ringing.includes(u.id))).length;
      const done = resolvedBy.get(u.id) ?? 0;
      const target = targetBy.get(u.id) ?? 0;
      const b = breaks.byUser.get(u.id) ?? { usedMinutes: 0, entries: [] };
      return {
        id: u.id,
        role: companyRole(u.role),
        name: u.name,
        initials: u.initials,
        title: u.title,
        email: u.email,
        phone: u.phone,
        status: u.status,
        avatarColor: u.avatarColor,
        presence: presenceBy.get(u.id)!,
        note: u.note,
        permissions: u.role === 'manager' ? ALL_ON : { ...base, ...(overrideBy.get(u.id) ?? {}) },
        stats: {
          openChats: openBy.get(u.id) ?? 0,
          avgFirstReplySeconds: replyBy.get(u.id) ?? null,
          callsToday: handled,
          callsMissed: missed,
          resolved: done,
          targetPercent: target > 0 ? Math.round((done / target) * 100) : 0
        },
        breaks: { usedMinutes: b.usedMinutes, entries: b.entries },
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null
      };
    });
  }

  private presentInvite(row: InviteRow, link?: string): Invite {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      title: row.title,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      ...(link ? { link } : {})
    };
  }

  /* ───────── Staff ───────── */

  async list(s: CompanySession, includeDisabled: boolean): Promise<StaffMember[] | StaffBrief[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.companyId, s.companyId),
          inArray(users.role, COMPANY_ROLES),
          includeDisabled && s.role === 'manager' ? undefined : ne(users.status, 'disabled')
        )
      )
      .orderBy(desc(sql`${users.role} = 'manager'`), asc(users.name));
    if (s.role !== 'manager') {
      const p = await this.presence.presenceOf(s.companyId, rows.map(r => r.id));
      return rows.map(r => this.brief(r, p.get(r.id)!));
    }
    return this.presentMembers(s.companyId, rows);
  }

  async summary(s: CompanySession, id: string): Promise<StaffSummary> {
    const u = await this.member(s.companyId, id);
    const [m] = await this.presentMembers(s.companyId, [u]);
    const [n] = await this.db
      .select({ n: count() })
      .from(contacts)
      .where(and(eq(contacts.companyId, s.companyId), eq(contacts.ownerUserId, u.id)));
    return { ...m, assignedCustomers: Number(n?.n ?? 0) };
  }

  async presenceBoard(s: CompanySession): Promise<StaffBrief[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.companyId, s.companyId), inArray(users.role, COMPANY_ROLES), eq(users.status, 'active')))
      .orderBy(asc(users.name));
    const p = await this.presence.presenceOf(s.companyId, rows.map(r => r.id));
    return rows.map(r => this.brief(r, p.get(r.id)!));
  }

  async setPresenceFor(s: CompanySession, id: string, input: PresenceInput): Promise<PresenceMap> {
    const u = await this.member(s.companyId, id);
    if (u.status !== 'active') throw notFound('Staff member');
    const out = await this.presence.set(s.companyId, u.id, input);
    if (u.id !== s.userId) {
      await this.audit.log(s, {
        action: 'staff.presence',
        targetType: 'user',
        targetId: u.id,
        summary: `Set ${u.name} to ${input.status} (${input.channel})`
      });
    }
    return out;
  }

  async update(s: CompanySession, id: string, input: UpdateStaffInput): Promise<StaffMember> {
    let u = await this.member(s.companyId, id);
    const changes: string[] = [];
    const patch: Partial<UserRow> = {};
    if (input.name !== undefined && input.name !== u.name) {
      patch.name = input.name;
      patch.initials = initialsOf(input.name);
      changes.push('name');
    }
    if (input.title !== undefined && input.title !== u.title) {
      patch.title = input.title;
      changes.push('title');
    }
    if (input.phone !== undefined && input.phone !== u.phone) {
      patch.phone = input.phone;
      changes.push('phone');
    }
    if (input.note !== undefined && input.note !== u.note) {
      patch.note = input.note;
      changes.push('note');
    }
    if (Object.keys(patch).length) {
      [u] = await this.db.update(users).set(patch).where(eq(users.id, u.id)).returning();
    }
    if (input.permissions && Object.keys(input.permissions).length) {
      const [existing] = await this.db.select().from(userPermissions).where(eq(userPermissions.userId, u.id)).limit(1);
      const overrides = { ...(existing?.overrides ?? {}), ...input.permissions };
      await this.db
        .insert(userPermissions)
        .values({ userId: u.id, companyId: s.companyId, overrides })
        .onConflictDoUpdate({ target: userPermissions.userId, set: { overrides } });
      this.sessions.invalidate(u.id);
      changes.push(`permissions (${Object.entries(input.permissions).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')})`);
    }
    if (changes.length) {
      await this.audit.log(s, { action: 'staff.updated', targetType: 'user', targetId: u.id, summary: `Updated ${u.name}: ${changes.join('; ')}` });
    }
    if (input.status === 'disabled' && u.status !== 'disabled') await this.disable(s, u);
    else if (input.status === 'active' && u.status === 'disabled') await this.enable(s, u);
    const [m] = await this.presentMembers(s.companyId, [await this.member(s.companyId, u.id)]);
    return m;
  }

  async remove(s: CompanySession, id: string): Promise<void> {
    const u = await this.member(s.companyId, id);
    if (u.status !== 'disabled') await this.disable(s, u);
  }

  /** Disable: log out everywhere, free the seat, return their customers to the team pool. */
  private async disable(s: CompanySession, u: UserRow): Promise<void> {
    if (u.id === s.userId) throw new AppError('FORBIDDEN', 'You cannot remove yourself.');
    const released = await this.db.transaction(async tx => {
      if (u.role === 'manager') {
        const [others] = await tx
          .select({ n: count() })
          .from(users)
          .where(and(eq(users.companyId, s.companyId), eq(users.role, 'manager'), eq(users.status, 'active'), ne(users.id, u.id)));
        if (Number(others?.n ?? 0) === 0) throw new AppError('CONFLICT', 'A company needs at least one active manager.');
      }
      await tx
        .update(users)
        .set({ status: 'disabled', tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, u.id));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
      await this.presence.signOff(s.companyId, u.id, tx);
      const owned = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.companyId, s.companyId), eq(contacts.ownerUserId, u.id)));
      for (const c of owned) {
        await this.inbox.setOwner(s.companyId, c, null, { userId: null, name: 'System', kind: 'system' }, 'Staff member removed', tx);
      }
      return owned.map(c => c.id);
    });
    this.sessions.invalidate(u.id);
    this.realtime.emit([rooms.user(u.id)], 'session.revoked', { reason: 'Your account was disabled by your manager.' });
    this.realtime.disconnectUser(u.id);
    if (released.length) {
      const convs = await this.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.companyId, s.companyId), inArray(conversations.contactId, released)));
      for (const c of convs) await this.inbox.emitConversation(s.companyId, c.id, u.id);
    }
    await this.audit.log(s, {
      action: 'staff.disabled',
      targetType: 'user',
      targetId: u.id,
      summary: `Removed ${u.name}; ${released.length} customer${released.length === 1 ? '' : 's'} returned to the team pool`
    });
  }

  private async enable(s: CompanySession, u: UserRow): Promise<void> {
    await this.db.transaction(async tx => {
      const seats = await this.seatUsage(s.companyId, tx, true);
      if (seats.used + seats.pendingInvites >= seats.limit) {
        throw new AppError('SEAT_LIMIT_REACHED', `All ${seats.limit} seats are in use. Remove someone or ask LUMI AI for more seats.`);
      }
      await tx.update(users).set({ status: 'active' }).where(eq(users.id, u.id));
    });
    this.sessions.invalidate(u.id);
    await this.audit.log(s, { action: 'staff.enabled', targetType: 'user', targetId: u.id, summary: `Re-activated ${u.name}` });
  }

  /* ───────── Seats and invites ───────── */

  private async seatUsage(companyId: string, tx?: DbOrTx, lock = false): Promise<SeatsResponse> {
    const db = tx ?? this.db;
    const q = db
      .select({ seatLimit: companies.seatLimit, planName: plans.name })
      .from(companies)
      .leftJoin(plans, eq(plans.id, companies.planId))
      .where(eq(companies.id, companyId))
      .limit(1);
    const [c] = lock ? await q.for('update', { of: companies }) : await q;
    if (!c) throw notFound('Company');
    const [u] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.companyId, companyId), inArray(users.role, COMPANY_ROLES), inArray(users.status, ['active', 'invited'])));
    const [i] = await db
      .select({ n: count() })
      .from(invites)
      .where(and(eq(invites.companyId, companyId), isNull(invites.acceptedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, new Date())));
    return {
      used: Number(u?.n ?? 0),
      pendingInvites: Number(i?.n ?? 0),
      limit: Math.min(c.seatLimit, MAX_SEATS),
      planName: c.planName ?? null
    };
  }

  seats(s: CompanySession): Promise<SeatsResponse> {
    return this.seatUsage(s.companyId);
  }

  async pendingInvites(s: CompanySession): Promise<Invite[]> {
    const rows = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.companyId, s.companyId), isNull(invites.acceptedAt), isNull(invites.cancelledAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt));
    return rows.map(r => this.presentInvite(r));
  }

  async invite(s: CompanySession, input: CreateInviteInput): Promise<Invite> {
    const token = randomToken();
    const row = await this.db.transaction(async tx => {
      const seats = await this.seatUsage(s.companyId, tx, true);
      if (seats.used + seats.pendingInvites >= seats.limit) {
        throw new AppError('SEAT_LIMIT_REACHED', `All ${seats.limit} seats are in use. Remove someone or ask LUMI AI for more seats.`);
      }
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (taken) throw new AppError('EMAIL_TAKEN', 'Someone already uses this email address.');
      const [pending] = await tx
        .select({ id: invites.id })
        .from(invites)
        .where(
          and(
            eq(invites.companyId, s.companyId),
            eq(invites.email, input.email),
            isNull(invites.acceptedAt),
            isNull(invites.cancelledAt),
            gt(invites.expiresAt, new Date())
          )
        )
        .limit(1);
      if (pending) throw new AppError('CONFLICT', 'An invite is already waiting for this email. Resend it instead.');
      const [created] = await tx
        .insert(invites)
        .values({
          companyId: s.companyId,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          title: input.title,
          role: input.role,
          tokenHash: sha256(token),
          invitedBy: s.userId,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600_000)
        })
        .returning();
      return created;
    });
    const link = await this.sendInvite(s, row, token);
    await this.audit.log(s, {
      action: 'staff.invited',
      targetType: 'invite',
      targetId: row.id,
      summary: `Invited ${row.name} (${row.email}) as ${row.role}`
    });
    return this.presentInvite(row, link);
  }

  async resendInvite(s: CompanySession, id: string): Promise<Invite> {
    const token = randomToken();
    const row = await this.db.transaction(async tx => {
      const inv = await this.openInvite(s.companyId, id, tx);
      if (inv.expiresAt.getTime() <= Date.now()) {
        // An expired invite no longer holds a seat; reviving it needs one.
        const seats = await this.seatUsage(s.companyId, tx, true);
        if (seats.used + seats.pendingInvites >= seats.limit) {
          throw new AppError('SEAT_LIMIT_REACHED', `All ${seats.limit} seats are in use. Remove someone or ask LUMI AI for more seats.`);
        }
      }
      const [u] = await tx
        .update(invites)
        .set({ tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600_000) })
        .where(eq(invites.id, inv.id))
        .returning();
      return u;
    });
    const link = await this.sendInvite(s, row, token);
    await this.audit.log(s, { action: 'staff.invite_resent', targetType: 'invite', targetId: row.id, summary: `Resent the invite to ${row.email}` });
    return this.presentInvite(row, link);
  }

  async cancelInvite(s: CompanySession, id: string): Promise<void> {
    const inv = await this.openInvite(s.companyId, id);
    await this.db.update(invites).set({ cancelledAt: new Date() }).where(eq(invites.id, inv.id));
    await this.audit.log(s, { action: 'staff.invite_cancelled', targetType: 'invite', targetId: inv.id, summary: `Cancelled the invite to ${inv.email}` });
  }

  private async openInvite(companyId: string, id: string, tx?: DbOrTx): Promise<InviteRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Invite');
    const [inv] = await (tx ?? this.db)
      .select()
      .from(invites)
      .where(and(eq(invites.id, id), eq(invites.companyId, companyId), isNull(invites.acceptedAt), isNull(invites.cancelledAt)))
      .limit(1);
    if (!inv) throw notFound('Invite');
    return inv;
  }

  private async sendInvite(s: CompanySession, row: InviteRow, token: string): Promise<string> {
    const link = `${env.APP_URL}/invite/${token}`;
    const company = await this.company(s.companyId);
    const subject = `${s.name} invited you to ${company.name} on Smart Reply`;
    const text = `Hello ${row.name},\n\n${s.name} invited you to join ${company.name} on Smart Reply as ${row.role}.\nOpen this link to set your password: ${link}\n\nThe link works for ${INVITE_DAYS} days.`;
    const html = emailLayout(
      `Join ${escapeHtml(company.name)} on Smart Reply`,
      [
        `Hello ${escapeHtml(row.name)},`,
        `${escapeHtml(s.name)} invited you to join ${escapeHtml(company.name)} as ${row.role}.`,
        `The link works for ${INVITE_DAYS} days.`
      ],
      { label: 'Accept the invite', url: link }
    );
    await this.mailer.send(row.email, subject, text, html);
    return link;
  }

  /* ───────── Roles ───────── */

  async roles(s: CompanySession): Promise<RolesResponse> {
    return { staff: await this.rolePermissions(s.companyId) };
  }

  async updateRoles(s: CompanySession, patch: Partial<StaffPermissions>): Promise<RolesResponse> {
    const staff = { ...(await this.rolePermissions(s.companyId)), ...patch };
    await this.db
      .insert(rolePermissions)
      .values({ companyId: s.companyId, staff })
      .onConflictDoUpdate({ target: rolePermissions.companyId, set: { staff } });
    const people = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, s.companyId), eq(users.role, 'staff')));
    for (const p of people) this.sessions.invalidate(p.id);
    await this.audit.log(s, {
      action: 'roles.updated',
      targetType: 'role',
      targetId: 'staff',
      summary: `Staff role: ${Object.entries(patch).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ') || 'no change'}`
    });
    return { staff };
  }
}
