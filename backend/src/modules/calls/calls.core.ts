/**
 * Shared pieces of WhatsApp Calling (Stage A): settings with defaults, the call presenter,
 * who hears about a call, call presence and the call event trail.
 */
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Call, ChannelPresence, ForwardingRules, PresenceStatus, formatPhone, initialsOf } from '@smart-reply/shared';
import { FilesService } from '../../core/files.service';
import { InboxService } from '../../core/inbox.service';
import type { Db, DbOrTx } from '../../db/client';
import { assignmentRules, callEvents, callSettings, calls, contacts, presence, userForwarding, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Realtime, rooms } from '../../infra/realtime';

export type CallRow = typeof calls.$inferSelect;
export type CallSettingsRow = typeof callSettings.$inferSelect;

/** Meta ends an unanswered call after roughly 30 to 60 seconds; we stop trying new people after this. */
export const RING_WINDOW_MS = 45_000;
/** Temporary call permission lasts 7 days (Meta). */
export const TEMP_PERMISSION_MS = 7 * 24 * 3600_000;
/** Four unanswered business-initiated calls in a row revoke the permission (Meta). */
export const MAX_UNANSWERED_BUSINESS_CALLS = 4;
export const DEFAULT_MISSED_CALL_TEXT = 'Sorry we missed your call. We will call you back soon.';
export const VOICE_NOTE_TEXT = 'Sorry we could not take your call right now. Please send us a WhatsApp voice note and we will get back to you soon.';
export const STAGE_B_MESSAGE = 'Needs the call media server (Stage B). See docs/plan/04.';

export const DEFAULT_FORWARDING: ForwardingRules = {
  noAnswer: 'queue',
  busy: 'wait',
  onBreak: 'queue',
  away: 'queue',
  dnd: 'msg',
  afterHours: 'msg'
};

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Meta sends unix seconds as a string or number. */
export function unixToDate(v: unknown): Date | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function contactDisplayName(c: Pick<typeof contacts.$inferSelect, 'name' | 'profileName' | 'waId' | 'username'>): string {
  return c.name || c.profileName || (c.waId ? formatPhone(c.waId) : (c.username ?? 'WhatsApp user'));
}

@Injectable()
export class CallsCore {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: Realtime,
    private readonly inbox: InboxService,
    private readonly files: FilesService
  ) {}

  /* ───────── Settings ───────── */

  async settings(companyId: string, tx?: DbOrTx): Promise<CallSettingsRow> {
    const db = tx ?? this.db;
    const [row] = await db.select().from(callSettings).where(eq(callSettings.companyId, companyId)).limit(1);
    if (row) return row;
    await db.insert(callSettings).values({ companyId }).onConflictDoNothing();
    const [again] = await db.select().from(callSettings).where(eq(callSettings.companyId, companyId)).limit(1);
    return again!;
  }

  async assignment(companyId: string): Promise<{ callRingOwnerFirst: boolean; missedCallTemplateId: string | null }> {
    const [row] = await this.db
      .select({ callRingOwnerFirst: assignmentRules.callRingOwnerFirst, missedCallTemplateId: assignmentRules.missedCallTemplateId })
      .from(assignmentRules)
      .where(eq(assignmentRules.companyId, companyId))
      .limit(1);
    return row ?? { callRingOwnerFirst: true, missedCallTemplateId: null };
  }

  /** A user's own forwarding rules, or the company's when they have none. */
  async personalRules(companyId: string, userId: string): Promise<ForwardingRules> {
    const [row] = await this.db
      .select({ rules: userForwarding.rules })
      .from(userForwarding)
      .where(and(eq(userForwarding.userId, userId), eq(userForwarding.companyId, companyId)))
      .limit(1);
    if (row) return row.rules;
    return (await this.settings(companyId)).forwarding;
  }

  /* ───────── People ───────── */

  /** Active managers and staff whose call status is "available", ordered by id. */
  async availableUsers(companyId: string, role?: 'manager' | 'staff'): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(presence, and(eq(presence.userId, users.id), eq(presence.channel, 'call')))
      .where(
        and(
          eq(users.companyId, companyId),
          eq(users.status, 'active'),
          role ? eq(users.role, role) : inArray(users.role, ['manager', 'staff']),
          eq(presence.status, 'available')
        )
      )
      .orderBy(asc(users.id));
    return rows.map(r => r.id);
  }

  /** Call status of an active user of the company, or null when the user is not active there. */
  async callStatusOf(companyId: string, userId: string): Promise<PresenceStatus | null> {
    const [row] = await this.db
      .select({ status: presence.status })
      .from(users)
      .leftJoin(presence, and(eq(presence.userId, users.id), eq(presence.channel, 'call')))
      .where(and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.status, 'active'), inArray(users.role, ['manager', 'staff'])))
      .limit(1);
    if (!row) return null;
    return row.status ?? 'away';
  }

  /**
   * Set a user's call presence. With `onlyFrom`, only when the current status is one of those
   * (so ending a call does not undo a break the user started meanwhile).
   */
  async setCallPresence(companyId: string, userId: string, status: PresenceStatus, onlyFrom?: PresenceStatus[]): Promise<void> {
    const [cur] = await this.db
      .select()
      .from(presence)
      .where(and(eq(presence.userId, userId), eq(presence.channel, 'call'), eq(presence.companyId, companyId)))
      .limit(1);
    if (onlyFrom && (!cur || !onlyFrom.includes(cur.status))) return;
    if (cur?.status === status) return;
    const since = new Date();
    const [row] = await this.db
      .insert(presence)
      .values({ userId, channel: 'call', companyId, status, since, reason: '', plannedMinutes: 0 })
      .onConflictDoUpdate({ target: [presence.userId, presence.channel], set: { status, since, reason: '', plannedMinutes: 0 } })
      .returning();
    const p: ChannelPresence = { status: row.status, reason: row.reason, since: row.since.toISOString(), plannedMinutes: row.plannedMinutes };
    this.realtime.emit([rooms.managers(companyId), rooms.user(userId), rooms.company(companyId)], 'presence.updated', {
      userId,
      channel: 'call',
      presence: p
    });
  }

  /* ───────── Trail ───────── */

  async event(companyId: string, callId: string, kind: string, actorUserId: string | null, data: Record<string, unknown> | null = null): Promise<void> {
    await this.db.insert(callEvents).values({ companyId, callId, kind, actorUserId, data });
  }

  /** Ring rounds of a call, oldest first. */
  async ringRounds(callId: string): Promise<{ round: number; userIds: string[] }[]> {
    const rows = await this.db
      .select({ data: callEvents.data })
      .from(callEvents)
      .where(and(eq(callEvents.callId, callId), eq(callEvents.kind, 'ring')))
      .orderBy(asc(callEvents.at), asc(callEvents.id));
    return rows.map(r => {
      const d = (r.data ?? {}) as { round?: number; userIds?: string[] };
      return { round: d.round ?? 0, userIds: d.userIds ?? [] };
    });
  }

  /** System line in the customer's chat. */
  async systemLine(companyId: string, contactId: string, text: string): Promise<void> {
    const conv = await this.inbox.ensureConversation(companyId, contactId);
    const row = await this.inbox.addInternal(companyId, conv.id, 'system', text, null);
    await this.inbox.emitMessage(companyId, row.id);
  }

  async userName(userId: string | null): Promise<string> {
    if (!userId) return '';
    const [u] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.name ?? '';
  }

  /**
   * Increase the unanswered business-call count; at four in a row Meta revokes the permission,
   * so we mirror that.
   */
  async countUnanswered(companyId: string, contactId: string): Promise<void> {
    const [c] = await this.db
      .update(contacts)
      .set({ unansweredBusinessCalls: sql`${contacts.unansweredBusinessCalls} + 1` })
      .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)))
      .returning({ n: contacts.unansweredBusinessCalls });
    if (c && c.n >= MAX_UNANSWERED_BUSINESS_CALLS) {
      await this.db
        .update(contacts)
        .set({ callPermission: 'none', callPermissionExpiresAt: null })
        .where(eq(contacts.id, contactId));
      await this.inbox.emitContact(companyId, contactId);
    }
  }

  async resetUnanswered(contactId: string): Promise<void> {
    await this.db.update(contacts).set({ unansweredBusinessCalls: 0 }).where(eq(contacts.id, contactId));
  }

  /* ───────── Presenting and events ───────── */

  async present(rows: CallRow[], tx?: DbOrTx): Promise<Call[]> {
    if (rows.length === 0) return [];
    const db = tx ?? this.db;
    const contactRows = await db.select().from(contacts).where(inArray(contacts.id, [...new Set(rows.map(r => r.contactId))]));
    const contactBy = new Map(contactRows.map(c => [c.id, c]));
    const userIds = [...new Set(rows.map(r => r.handledByUserId).filter((x): x is string => Boolean(x)))];
    const userRows = userIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
    const nameBy = new Map(userRows.map(u => [u.id, u.name]));
    const recIds = rows.map(r => r.recordingFileId).filter((x): x is string => Boolean(x));
    const refs = await this.files.refs(recIds, db);
    return rows
      .filter(r => contactBy.has(r.contactId))
      .map(r => {
        const c = contactBy.get(r.contactId)!;
        const name = contactDisplayName(c);
        const rec = r.recordingFileId ? (refs.get(r.recordingFileId) ?? null) : null;
        return {
          id: r.id,
          contactId: r.contactId,
          contact: { id: c.id, name, initials: initialsOf(name), phone: c.waId ? formatPhone(c.waId) : '', avatarColor: c.avatarColor },
          direction: r.direction,
          outcome: r.outcome,
          handledBy: r.handledByUserId ? { userId: r.handledByUserId, name: nameBy.get(r.handledByUserId) ?? '' } : null,
          startedAt: r.startedAt.toISOString(),
          answeredAt: r.answeredAt?.toISOString() ?? null,
          endedAt: r.endedAt?.toISOString() ?? null,
          durationSeconds: r.durationSeconds,
          note: r.note,
          hasRecording: rec !== null,
          recordingUrl: rec?.url ?? null,
          hasSummary: r.aiSummary !== null && r.aiSummary !== '',
          summary: r.aiSummary,
          ivrOption: r.ivrOption,
          aiAgent: r.handledByAi,
          ringingUserIds: r.outcome === 'ringing' ? r.ringingUserIds : []
        };
      });
  }

  async presentOne(row: CallRow): Promise<Call> {
    const [c] = await this.present([row]);
    return c;
  }

  /** Everyone who should see a call change: managers, everyone rung, the handler and the owner. */
  async audience(row: CallRow): Promise<string[]> {
    const ids = new Set<string>(row.ringingUserIds);
    for (const r of await this.ringRounds(row.id)) for (const u of r.userIds) ids.add(u);
    if (row.handledByUserId) ids.add(row.handledByUserId);
    const [c] = await this.db.select({ owner: contacts.ownerUserId }).from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
    if (c?.owner) ids.add(c.owner);
    return [rooms.managers(row.companyId), ...[...ids].map(id => rooms.user(id))];
  }

  async emitUpdated(row: CallRow): Promise<Call> {
    const call = await this.presentOne(row);
    if (call) this.realtime.emit(await this.audience(row), 'call.updated', { call });
    return call;
  }
}
