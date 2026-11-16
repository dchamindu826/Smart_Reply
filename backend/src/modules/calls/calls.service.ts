/** Call actions from the agent's device (Stage A), the call log and the call scheduler. */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, isNotNull, lt, lte, ne, or, SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ActiveCalls,
  Call,
  Page,
  ScheduledCall,
  callListQuery,
  scheduledCallSchema
} from '@smart-reply/shared';
import { AppError, forbidden, notFound } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { InboxService, contactVisibility, viewerOf } from '../../core/inbox.service';
import { MessagingService, windowOpen } from '../../core/messaging.service';
import type { Db } from '../../db/client';
import { calls, contacts, scheduledCalls, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { toAppError } from '../../meta/graph';
import { WhatsappAccounts } from '../../meta/platform';
import { CallRow, CallsCore, STAGE_B_MESSAGE, contactDisplayName } from './calls.core';
import { CallsEngine } from './calls.engine';

type CallListQuery = z.infer<typeof callListQuery>;
type ScheduledCallInput = z.infer<typeof scheduledCallSchema>;

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}
function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  try {
    const [a, id] = Buffer.from(c, 'base64url').toString().split('|');
    const at = new Date(a ?? '');
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

@Injectable()
export class CallsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly core: CallsCore,
    private readonly engine: CallsEngine,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly whatsapp: WhatsappAccounts
  ) {}

  /* ───────── Visibility ───────── */

  /** Staff see calls of customers they may see, plus calls they handle or are rung for. */
  private visible(s: CompanySession): SQL | undefined {
    const v = viewerOf(s);
    const contactCond = contactVisibility(v);
    if (!contactCond) return undefined;
    return or(contactCond, eq(calls.handledByUserId, s.userId), sql`${s.userId}::uuid = any(${calls.ringingUserIds})`);
  }

  private async load(s: CompanySession, id: string): Promise<CallRow> {
    if (!UUID.test(id)) throw notFound('Call');
    const [row] = await this.db
      .select({ call: calls })
      .from(calls)
      .innerJoin(contacts, eq(contacts.id, calls.contactId))
      .where(and(eq(calls.id, id), eq(calls.companyId, s.companyId), this.visible(s)))
      .limit(1);
    if (!row) throw notFound('Call');
    return row.call;
  }

  private assertRungOrManager(s: CompanySession, row: CallRow): void {
    if (s.role !== 'manager' && !row.ringingUserIds.includes(s.userId)) throw forbidden('This call is not ringing for you.');
  }

  private assertRingingIncoming(row: CallRow): void {
    if (row.direction !== 'in') throw new AppError('CALL_STATE', 'This is not an incoming call.');
    if (row.outcome !== 'ringing') throw new AppError('CALL_STATE', 'This call is no longer ringing.');
  }

  /* ───────── Log ───────── */

  async list(s: CompanySession, q: CallListQuery): Promise<Page<Call>> {
    const conds: (SQL | undefined)[] = [eq(calls.companyId, s.companyId), this.visible(s)];
    switch (q.filter) {
      case 'missed':
        conds.push(eq(calls.outcome, 'missed'));
        break;
      case 'rejected':
        conds.push(eq(calls.outcome, 'rejected'));
        break;
      case 'recorded':
        conds.push(isNotNull(calls.recordingFileId));
        break;
      case 'incoming':
        conds.push(eq(calls.direction, 'in'));
        break;
      case 'outgoing':
        conds.push(eq(calls.direction, 'out'));
        break;
      default:
        break;
    }
    if (q.staff) conds.push(eq(calls.handledByUserId, q.staff));
    if (q.from) conds.push(gte(calls.startedAt, new Date(q.from)));
    if (q.to) conds.push(lte(calls.startedAt, new Date(q.to)));
    if (q.search) {
      const term = `%${q.search.replace(/[%_]/g, '')}%`;
      const digits = q.search.replace(/\D/g, '');
      conds.push(or(ilike(contacts.name, term), ilike(contacts.profileName, term), ...(digits.length >= 3 ? [ilike(contacts.waId, `%${digits}%`)] : [])));
    }
    const cur = decodeCursor(q.cursor);
    if (cur) conds.push(or(lt(calls.startedAt, cur.at), and(eq(calls.startedAt, cur.at), lt(calls.id, cur.id))));
    const rows = await this.db
      .select({ call: calls })
      .from(calls)
      .innerJoin(contacts, eq(contacts.id, calls.contactId))
      .where(and(...conds))
      .orderBy(desc(calls.startedAt), desc(calls.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit).map(r => r.call);
    const last = page[page.length - 1];
    return { items: await this.core.present(page), nextCursor: rows.length > q.limit && last ? encodeCursor(last.startedAt, last.id) : null };
  }

  async get(s: CompanySession, id: string): Promise<Call> {
    return this.core.presentOne(await this.load(s, id));
  }

  async active(s: CompanySession): Promise<ActiveCalls> {
    const mine = s.role === 'manager' ? undefined : or(eq(calls.handledByUserId, s.userId), sql`${s.userId}::uuid = any(${calls.ringingUserIds})`);
    const rows = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.companyId, s.companyId), inArray(calls.outcome, ['ringing', 'ongoing']), mine))
      .orderBy(desc(calls.startedAt))
      .limit(50);
    const presented = await this.core.present(rows);
    const byId = new Map(presented.map(c => [c.id, c]));
    const ringing = rows
      .filter(r => r.outcome === 'ringing' && r.direction === 'in' && r.ringingUserIds.includes(s.userId) && byId.has(r.id))
      .map(r => ({ call: byId.get(r.id)!, sdpOffer: r.sdpOffer, ivrOption: r.ivrOption }));
    return { calls: presented, ringing };
  }

  /* ───────── Incoming call actions ───────── */

  async answer(s: CompanySession, id: string, sdpAnswer: string): Promise<Call> {
    const row = await this.load(s, id);
    this.assertRingingIncoming(row);
    this.assertRungOrManager(s, row);
    if (!row.waCallId) throw new AppError('CALL_STATE', 'This call has no WhatsApp call id.');
    const wa = await this.whatsapp.require(s.companyId);
    // Atomic claim: only one device can win the call.
    const [claimed] = await this.db
      .update(calls)
      .set({ outcome: 'ongoing', handledByUserId: s.userId, answeredAt: new Date(), ringingUserIds: [] })
      .where(and(eq(calls.id, row.id), eq(calls.companyId, s.companyId), eq(calls.outcome, 'ringing')))
      .returning();
    if (!claimed) throw new AppError('CALL_STATE', 'This call was already answered or has ended.');
    const session = { sdp_type: 'answer', sdp: sdpAnswer };
    try {
      await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'pre_accept', session });
      await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'accept', session, biz_opaque_callback_data: row.id });
    } catch (err) {
      const [failed] = await this.db.update(calls).set({ outcome: 'failed', endedAt: new Date() }).where(eq(calls.id, row.id)).returning();
      await this.core.event(s.companyId, row.id, 'answer_failed', s.userId);
      await this.core.emitUpdated(failed);
      throw toAppError(err);
    }
    await this.core.setCallPresence(s.companyId, s.userId, 'oncall');
    await this.core.event(s.companyId, row.id, 'answered', s.userId);
    return this.core.emitUpdated(claimed);
  }

  async decline(s: CompanySession, id: string, messageText?: string): Promise<Call> {
    const row = await this.load(s, id);
    this.assertRingingIncoming(row);
    this.assertRungOrManager(s, row);
    const [claimed] = await this.db
      .update(calls)
      .set({ outcome: 'rejected', endedAt: new Date(), ringingUserIds: [], handledByUserId: s.userId })
      .where(and(eq(calls.id, row.id), eq(calls.companyId, s.companyId), eq(calls.outcome, 'ringing')))
      .returning();
    if (!claimed) throw new AppError('CALL_STATE', 'This call was already answered or has ended.');
    const wa = await this.whatsapp.find(s.companyId);
    if (wa && row.waCallId) {
      try {
        await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'reject' });
      } catch (err) {
        logger.warn({ err, callId: row.id }, 'Could not reject the call on WhatsApp');
      }
    }
    await this.core.event(s.companyId, row.id, 'declined', s.userId, { withMessage: Boolean(messageText) });
    await this.core.systemLine(s.companyId, row.contactId, `Call declined by ${s.name}`);
    const text = messageText?.trim();
    if (text) {
      const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
      const conv = await this.inbox.ensureConversation(s.companyId, row.contactId);
      if (contact && windowOpen(conv)) {
        try {
          await this.messaging.sendFreeForm(s.companyId, conv, contact, { text, fileIds: [] }, { userId: s.userId, kind: 'user' });
        } catch (err) {
          logger.warn({ err, callId: row.id }, 'Decline message not sent');
        }
      }
    }
    return this.core.emitUpdated(claimed);
  }

  async hangup(s: CompanySession, id: string): Promise<Call> {
    const row = await this.load(s, id);
    if (row.direction === 'in' && row.outcome === 'ringing') throw new AppError('CALL_STATE', 'This call has not been answered. Decline it instead.');
    if (s.role !== 'manager' && row.handledByUserId !== s.userId) throw forbidden('Only the person on the call can hang up.');
    const wa = await this.whatsapp.require(s.companyId);
    if (row.waCallId) {
      // Meta asks for terminate even when the audio has already stopped.
      try {
        await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'terminate' });
      } catch (err) {
        logger.warn({ err, callId: row.id }, 'Terminate on WhatsApp failed');
      }
    }
    const now = new Date();
    if (row.outcome === 'ongoing') {
      const seconds = row.answeredAt ? Math.round((now.getTime() - row.answeredAt.getTime()) / 1000) : 0;
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'answered', endedAt: now, durationSeconds: seconds })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ongoing')))
        .returning();
      if (u) {
        await this.engine.afterAnsweredEnd(u, seconds);
        return this.core.presentOne(u);
      }
    } else if (row.outcome === 'ringing' && row.direction === 'out') {
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'missed', endedAt: now })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
        .returning();
      if (u) {
        await this.core.countUnanswered(s.companyId, u.contactId);
        await this.core.event(s.companyId, u.id, 'cancelled', s.userId);
        await this.core.systemLine(s.companyId, u.contactId, `Outgoing call not answered · ${s.name}`);
        if (u.handledByUserId) await this.core.setCallPresence(s.companyId, u.handledByUserId, 'available', ['oncall']);
        return this.core.emitUpdated(u);
      }
    }
    if (row.handledByUserId) await this.core.setCallPresence(s.companyId, row.handledByUserId, 'available', ['oncall']);
    const [fresh] = await this.db.select().from(calls).where(eq(calls.id, row.id)).limit(1);
    return this.core.presentOne(fresh);
  }

  async forward(s: CompanySession, id: string, destination: string): Promise<Call> {
    const row = await this.load(s, id);
    if (row.outcome === 'ongoing') throw new AppError('NOT_AVAILABLE', `Transferring a call in progress: ${STAGE_B_MESSAGE}`);
    this.assertRingingIncoming(row);
    this.assertRungOrManager(s, row);
    if (destination.startsWith('user:')) {
      const status = await this.core.callStatusOf(s.companyId, destination.slice(5));
      if (status === null) throw notFound('Staff member');
    }
    const rounds = await this.core.ringRounds(row.id);
    const round = (rounds[rounds.length - 1]?.round ?? -1) + 1;
    const targets = await this.engine.targetsFor(row, destination, new Set([s.userId]));
    await this.core.event(s.companyId, row.id, 'forwarded', s.userId, { destination });
    if (targets === null) {
      await this.engine.finishMissed(row, destination, { rejectOnMeta: true, reason: 'forwarded' });
    } else if (targets.length === 0) {
      throw new AppError('CONFLICT', 'Nobody is available there to take the call right now.');
    } else {
      await this.engine.ring(row, targets, round);
    }
    const [fresh] = await this.db.select().from(calls).where(eq(calls.id, row.id)).limit(1);
    return this.core.emitUpdated(fresh);
  }

  async note(s: CompanySession, id: string, note: string): Promise<Call> {
    const row = await this.load(s, id);
    const [u] = await this.db.update(calls).set({ note }).where(eq(calls.id, row.id)).returning();
    const conv = await this.inbox.ensureConversation(s.companyId, row.contactId);
    const msg = await this.inbox.addInternal(s.companyId, conv.id, 'note', `Call note: ${note}`, s.userId);
    await this.inbox.emitMessage(s.companyId, msg.id);
    return this.core.emitUpdated(u);
  }

  async summaryToChat(s: CompanySession, id: string): Promise<Call> {
    const row = await this.load(s, id);
    if (!row.aiSummary) throw new AppError('NOT_AVAILABLE', 'This call has no AI summary yet.');
    const conv = await this.inbox.ensureConversation(s.companyId, row.contactId);
    const msg = await this.inbox.addInternal(s.companyId, conv.id, 'note', `Call summary: ${row.aiSummary}`, s.userId);
    await this.inbox.emitMessage(s.companyId, msg.id);
    return this.core.presentOne(row);
  }

  /** Mute is done on the agent's device; this only records it in the call trail. */
  async mute(s: CompanySession, id: string, muted: boolean): Promise<void> {
    const row = await this.load(s, id);
    if (row.outcome !== 'ongoing') throw new AppError('CALL_STATE', 'This call is not in progress.');
    await this.core.event(s.companyId, row.id, muted ? 'muted' : 'unmuted', s.userId);
  }

  async stageB(s: CompanySession, id: string): Promise<never> {
    await this.load(s, id);
    throw new AppError('NOT_AVAILABLE', STAGE_B_MESSAGE);
  }

  /* ───────── Outgoing ───────── */

  async start(s: CompanySession, contactId: string, sdpOffer: string): Promise<Call> {
    if (!can(s, 'makeCalls')) throw forbidden('Your manager has turned off calling for you.');
    const contact = await this.inbox.visibleContact(viewerOf(s), contactId);
    if (contact.blockedAt) throw new AppError('CONFLICT', 'This customer is blocked.');
    if (!contact.waId && !contact.bsuid) throw new AppError('BAD_REQUEST', 'This customer has no WhatsApp number.');
    const wa = await this.whatsapp.require(s.companyId);
    if (!wa.account.callingEnabled) {
      throw new AppError('CALLING_NOT_ENABLED', 'Calling is off for this number, or its messaging limit is below 2,000');
    }
    const [busy] = await this.db
      .select({ id: calls.id })
      .from(calls)
      .where(and(eq(calls.companyId, s.companyId), eq(calls.handledByUserId, s.userId), inArray(calls.outcome, ['ringing', 'ongoing'])))
      .limit(1);
    if (busy) throw new AppError('CALL_STATE', 'You are already on a call.');

    if (contact.waId) {
      let perm;
      try {
        perm = await wa.graph.callPermissions(wa.phoneNumberId, contact.waId);
      } catch (err) {
        throw toAppError(err);
      }
      const status = perm.permission?.status;
      if (!status || status === 'no_permission') {
        if (contact.callPermission === 'temporary' || contact.callPermission === 'permanent') {
          await this.db.update(contacts).set({ callPermission: 'none', callPermissionExpiresAt: null }).where(eq(contacts.id, contact.id));
          await this.inbox.emitContact(s.companyId, contact.id);
        }
        throw new AppError('CALL_PERMISSION_MISSING', 'This customer has not allowed calls yet. Send a call permission request first.');
      }
      const expires = perm.permission?.expiration_time ? new Date(perm.permission.expiration_time * 1000) : null;
      if (contact.callPermission !== status || (contact.callPermissionExpiresAt?.getTime() ?? null) !== (expires?.getTime() ?? null)) {
        await this.db.update(contacts).set({ callPermission: status, callPermissionExpiresAt: expires }).where(eq(contacts.id, contact.id));
      }
      const action = perm.actions?.find(a => a.action_name === 'start_call');
      if (action && !action.can_perform_action) {
        throw new AppError('CALL_PERMISSION_LIMIT', 'WhatsApp does not allow another call to this customer right now. Try again later.');
      }
    }

    const [row] = await this.db
      .insert(calls)
      .values({ companyId: s.companyId, contactId: contact.id, direction: 'out', outcome: 'ringing', handledByUserId: s.userId })
      .returning();
    let waCallId: string | undefined;
    try {
      const target = contact.waId ? { to: contact.waId } : { recipient: contact.bsuid };
      const res = await wa.graph.callAction(wa.phoneNumberId, {
        ...target,
        action: 'connect',
        session: { sdp_type: 'offer', sdp: sdpOffer },
        biz_opaque_callback_data: row.id
      });
      waCallId = res.calls?.[0]?.id;
      if (!waCallId) throw new AppError('META_ERROR', 'WhatsApp did not return a call id.');
    } catch (err) {
      await this.db.update(calls).set({ outcome: 'failed', endedAt: new Date() }).where(eq(calls.id, row.id));
      await this.core.event(s.companyId, row.id, 'dial_failed', s.userId);
      throw toAppError(err);
    }
    const [u] = await this.db.update(calls).set({ waCallId }).where(eq(calls.id, row.id)).returning();
    await this.core.setCallPresence(s.companyId, s.userId, 'oncall');
    await this.core.event(s.companyId, row.id, 'dial', s.userId);
    return this.core.emitUpdated(u);
  }

  /* ───────── Scheduler ───────── */

  private async presentScheduled(rows: (typeof scheduledCalls.$inferSelect)[]): Promise<ScheduledCall[]> {
    if (rows.length === 0) return [];
    const cs = await this.db.select().from(contacts).where(inArray(contacts.id, [...new Set(rows.map(r => r.contactId))]));
    const us = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map(r => r.userId))]));
    const cBy = new Map(cs.map(c => [c.id, c]));
    const uBy = new Map(us.map(u => [u.id, u.name]));
    return rows.map(r => {
      const c = cBy.get(r.contactId);
      return {
        id: r.id,
        contactId: r.contactId,
        contactName: c ? contactDisplayName(c) : '',
        userId: r.userId,
        userName: uBy.get(r.userId) ?? '',
        scheduledAt: r.scheduledAt.toISOString(),
        note: r.note,
        status: r.status
      };
    });
  }

  async listScheduled(s: CompanySession): Promise<ScheduledCall[]> {
    const rows = await this.db
      .select()
      .from(scheduledCalls)
      .where(
        and(
          eq(scheduledCalls.companyId, s.companyId),
          ne(scheduledCalls.status, 'cancelled'),
          s.role === 'manager' ? undefined : eq(scheduledCalls.userId, s.userId)
        )
      )
      .orderBy(scheduledCalls.scheduledAt)
      .limit(500);
    return this.presentScheduled(rows);
  }

  async createScheduled(s: CompanySession, input: ScheduledCallInput): Promise<ScheduledCall> {
    const userId = input.userId ?? s.userId;
    if (s.role !== 'manager' && userId !== s.userId) throw forbidden('You can only schedule calls for yourself.');
    const contact = await this.inbox.visibleContact(viewerOf(s), input.contactId);
    if (userId !== s.userId && (await this.core.callStatusOf(s.companyId, userId)) === null) throw notFound('Staff member');
    const [row] = await this.db
      .insert(scheduledCalls)
      .values({ companyId: s.companyId, contactId: contact.id, userId, scheduledAt: new Date(input.scheduledAt), note: input.note })
      .returning();
    const [out] = await this.presentScheduled([row]);
    return out;
  }

  private async loadScheduled(s: CompanySession, id: string): Promise<typeof scheduledCalls.$inferSelect> {
    if (!UUID.test(id)) throw notFound('Scheduled call');
    const [row] = await this.db
      .select()
      .from(scheduledCalls)
      .where(
        and(
          eq(scheduledCalls.id, id),
          eq(scheduledCalls.companyId, s.companyId),
          s.role === 'manager' ? undefined : eq(scheduledCalls.userId, s.userId)
        )
      )
      .limit(1);
    if (!row) throw notFound('Scheduled call');
    return row;
  }

  async cancelScheduled(s: CompanySession, id: string): Promise<void> {
    const row = await this.loadScheduled(s, id);
    await this.db.update(scheduledCalls).set({ status: 'cancelled' }).where(eq(scheduledCalls.id, row.id));
  }

  async doneScheduled(s: CompanySession, id: string): Promise<ScheduledCall> {
    const row = await this.loadScheduled(s, id);
    const [u] = await this.db.update(scheduledCalls).set({ status: 'done' }).where(eq(scheduledCalls.id, row.id)).returning();
    const [out] = await this.presentScheduled([u]);
    return out;
  }
}
