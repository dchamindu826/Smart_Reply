/**
 * WhatsApp Calling, Stage A: the agent's browser or phone is the WebRTC peer and the server
 * relays SDP between it and Meta. This engine runs in the worker (webhooks, ring timers) and
 * in the API (ringing again after a forward).
 *
 * Every handler is safe to run twice: calls are unique by WhatsApp call id, outcomes only
 * move forward through `UPDATE … WHERE outcome = …`, and ring timers check their round.
 */
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { maskPhone, type PresenceStatus } from '@smart-reply/shared';
import { isOpen } from '../../core/hours';
import { ContactRow, InboxService } from '../../core/inbox.service';
import { MessagingService, windowOpen } from '../../core/messaging.service';
import { PushService } from '../../core/push.service';
import type { Db } from '../../db/client';
import { aiBotSettings, calls, companies, contacts, conversations, quickReplies } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Queues } from '../../infra/queues';
import { Realtime, rooms } from '../../infra/realtime';
import { WhatsappAccounts } from '../../meta/platform';
import { VoiceBus } from '../../voice/bus';
import { VoicePolicy } from '../../voice/voice-policy';
import {
  CallRow,
  CallsCore,
  DEFAULT_MISSED_CALL_TEXT,
  RING_WINDOW_MS,
  TEMP_PERMISSION_MS,
  VOICE_NOTE_TEXT,
  contactDisplayName,
  mmss,
  str,
  unixToDate
} from './calls.core';

/** One entry of the `calls` webhook value (checked against Meta's docs, Nov 2026). */
interface WaCall {
  id?: string;
  to?: string;
  from?: string;
  from_user_id?: string;
  event?: string;
  timestamp?: string | number;
  direction?: string;
  status?: string;
  start_time?: string | number;
  end_time?: string | number;
  duration?: string | number;
  session?: { sdp_type?: string; sdp?: string };
  biz_opaque_callback_data?: string;
}

interface WaCallContact {
  wa_id?: string;
  user_id?: string;
  profile?: { name?: string };
}

const BUSY_KEY: Record<Exclude<PresenceStatus, 'available'>, 'onBreak' | 'away' | 'dnd' | 'busy'> = {
  brk: 'onBreak',
  away: 'away',
  dnd: 'dnd',
  oncall: 'busy'
};

/** Destinations that end the call with a message instead of ringing someone. */
export function isTerminalDestination(dest: string): boolean {
  return dest === 'msg' || dest === 'vm' || dest.startsWith('quick_reply:');
}

@Injectable()
export class CallsEngine {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly core: CallsCore,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly push: PushService,
    private readonly queues: Queues,
    private readonly whatsapp: WhatsappAccounts,
    private readonly realtime: Realtime,
    private readonly voicePolicy: VoicePolicy,
    private readonly voiceBus: VoiceBus
  ) {}

  /* ───────── Webhooks ───────── */

  /** `calls` webhook field: connect (user- or business-initiated), terminate. */
  async handleCallWebhook(companyId: string, value: Record<string, unknown>): Promise<void> {
    const list = Array.isArray(value.calls) ? (value.calls as WaCall[]) : [];
    const waContacts = Array.isArray(value.contacts) ? (value.contacts as WaCallContact[]) : [];
    for (const c of list) {
      if (!c || typeof c !== 'object' || !str(c.id)) continue;
      const event = (c.event ?? '').toLowerCase();
      const direction = (c.direction ?? '').toUpperCase();
      if (event === 'connect' && direction === 'BUSINESS_INITIATED') await this.businessConnect(companyId, c);
      else if (event === 'connect') await this.incoming(companyId, c, waContacts);
      else if (event === 'terminate') await this.terminate(companyId, c);
    }
  }

  /** `statuses[]` entries with `type: "call"` (RINGING, ACCEPTED, REJECTED) for business-initiated calls. */
  async handleCallStatus(companyId: string, status: Record<string, unknown>): Promise<void> {
    const type = str(status.type);
    if (type && type !== 'call') return;
    const waCallId = str(status.id);
    const st = (str(status.status) ?? '').toUpperCase();
    if (!waCallId) return;
    const [row] = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.companyId, companyId), eq(calls.waCallId, waCallId)))
      .limit(1);
    if (!row || row.direction !== 'out') return;
    if (st === 'RINGING') {
      if (row.outcome === 'ringing') await this.core.event(companyId, row.id, 'customer_ringing', null);
      return;
    }
    if (st === 'ACCEPTED') {
      const at = unixToDate(status.timestamp) ?? new Date();
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'ongoing', answeredAt: at })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
        .returning();
      if (!u) return;
      await this.core.resetUnanswered(row.contactId);
      await this.core.event(companyId, row.id, 'accepted', null);
      await this.core.emitUpdated(u);
      return;
    }
    if (st === 'REJECTED') {
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'rejected', endedAt: unixToDate(status.timestamp) ?? new Date() })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
        .returning();
      if (!u) return;
      await this.core.countUnanswered(companyId, row.contactId);
      if (u.handledByUserId) await this.core.setCallPresence(companyId, u.handledByUserId, 'available', ['oncall']);
      await this.core.event(companyId, row.id, 'rejected', null);
      await this.core.systemLine(companyId, row.contactId, `Outgoing call declined by the customer${u.handledByUserId ? ` · ${await this.core.userName(u.handledByUserId)}` : ''}`);
      await this.core.emitUpdated(u);
    }
  }

  /** Customer answered the call permission request. */
  async handlePermissionReply(
    companyId: string,
    contactId: string,
    reply: { response: string; isPermanent: boolean; expiresAt: Date | null }
  ): Promise<void> {
    if (reply.response === 'accept') {
      await this.db
        .update(contacts)
        .set(
          reply.isPermanent
            ? { callPermission: 'permanent', callPermissionExpiresAt: null, unansweredBusinessCalls: 0 }
            : { callPermission: 'temporary', callPermissionExpiresAt: reply.expiresAt ?? new Date(Date.now() + TEMP_PERMISSION_MS), unansweredBusinessCalls: 0 }
        )
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
    } else {
      await this.db
        .update(contacts)
        .set({ callPermission: 'none', callPermissionExpiresAt: null })
        .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
    }
  }

  /** Ring timer fired: move to the next person or apply the no-answer rule. */
  async ringTimeout(callId: string, round: number): Promise<void> {
    const [row] = await this.db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!row || row.outcome !== 'ringing' || row.direction !== 'in' || row.handledByAi) return;
    const rounds = await this.core.ringRounds(row.id);
    const last = rounds[rounds.length - 1];
    if (!last || last.round !== round) return; // an older timer, or already moved on
    // "AI answers calls nobody takes": hand over after the first unanswered round, while the caller is still there.
    if ((await this.voicePolicy.when(row.companyId)) === 'no_answer' && (await this.handToAi(row, 'no_answer'))) return;
    const st = await this.core.settings(row.companyId);
    const excluded = new Set(rounds.flatMap(r => r.userIds));
    if (Date.now() - row.startedAt.getTime() < RING_WINDOW_MS) {
      const next = await this.pickByStrategy(row.companyId, st.ringStrategy, excluded);
      if (next.length) {
        await this.ring(row, next, round + 1);
        return;
      }
      const fallback = await this.targetsFor(row, st.forwarding.noAnswer, excluded);
      if (fallback && fallback.length) {
        await this.ring(row, fallback, round + 1);
        return;
      }
    }
    await this.finishMissed(row, st.forwarding.noAnswer, { rejectOnMeta: true, reason: 'no_answer' });
  }

  /* ───────── Incoming ───────── */

  private async incoming(companyId: string, c: WaCall, waContacts: WaCallContact[]): Promise<void> {
    const waCallId = c.id!;
    const [existing] = await this.db
      .select({ id: calls.id })
      .from(calls)
      .where(and(eq(calls.companyId, companyId), eq(calls.waCallId, waCallId)))
      .limit(1);
    if (existing) return;
    const from = (c.from ?? '').replace(/\D/g, '') || null;
    const bsuid = str(c.from_user_id);
    if (!from && !bsuid) return;
    const waContact = waContacts.find(w => (from && w.wa_id === from) || (bsuid && w.user_id === bsuid)) ?? waContacts[0];
    const { contact } = await this.inbox.ensureContact(companyId, {
      waId: from,
      bsuid,
      profileName: waContact?.profile?.name ?? ''
    });
    const conv = await this.inbox.ensureConversation(companyId, contact.id);
    // A user-initiated call starts or refreshes the 24-hour customer service window, answered or not (Meta, calling pricing).
    const callAt = unixToDate(c.timestamp) ?? new Date();
    const until = new Date(callAt.getTime() + 24 * 3600_000);
    if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() < until.getTime()) {
      await this.db.update(conversations).set({ windowExpiresAt: until }).where(eq(conversations.id, conv.id));
    }
    const [row] = await this.db
      .insert(calls)
      .values({
        companyId,
        contactId: contact.id,
        waCallId,
        direction: 'in',
        outcome: 'ringing',
        sdpOffer: c.session?.sdp ?? null,
        startedAt: unixToDate(c.timestamp) ?? new Date()
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return; // another worker stored it first
    logger.info({ companyId, callId: row.id, from: maskPhone(from ?? '') }, 'Incoming WhatsApp call');
    await this.core.event(companyId, row.id, 'incoming', null);
    await this.grantCallbackPermission(companyId, contact);
    await this.routeIncoming(row, contact);
  }

  /**
   * With `callback_permission_status` enabled (we always enable it), a customer who calls
   * grants temporary call permission.
   */
  private async grantCallbackPermission(companyId: string, contact: ContactRow): Promise<void> {
    const expired = contact.callPermission === 'temporary' && contact.callPermissionExpiresAt !== null && contact.callPermissionExpiresAt.getTime() < Date.now();
    if (contact.callPermission !== 'none' && contact.callPermission !== 'requested' && !expired) return;
    await this.db
      .update(contacts)
      .set({ callPermission: 'temporary', callPermissionExpiresAt: new Date(Date.now() + TEMP_PERMISSION_MS) })
      .where(eq(contacts.id, contact.id));
    await this.inbox.emitContact(companyId, contact.id);
  }

  private async routeIncoming(row: CallRow, contact: ContactRow): Promise<void> {
    const st = await this.core.settings(row.companyId);
    const aiWhen = await this.voicePolicy.when(row.companyId);
    if ((aiWhen === 'always' || (aiWhen === 'after_hours' && !isOpen(st.hours))) && (await this.handToAi(row, aiWhen))) return;
    const rules = await this.core.assignment(row.companyId);
    let dest = 'queue';
    if (!isOpen(st.hours)) {
      dest = st.forwarding.afterHours;
    } else if (rules.callRingOwnerFirst && contact.ownerUserId) {
      const status = await this.core.callStatusOf(row.companyId, contact.ownerUserId);
      if (status === 'available') dest = `user:${contact.ownerUserId}`;
      else if (status) {
        // The owner's personal rules decide (on break, away, do not disturb, busy on a call).
        const personal = await this.core.personalRules(row.companyId, contact.ownerUserId);
        dest = personal[BUSY_KEY[status]];
      }
    }
    await this.dispatch(row, dest, 0, new Set());
  }

  /** Ring the people a destination names, fall back to the no-answer rule, or end with a message. */
  async dispatch(row: CallRow, dest: string, round: number, excluded: Set<string>): Promise<void> {
    const targets = await this.targetsFor(row, dest, excluded);
    if (targets === null) {
      await this.finishMissed(row, dest, { rejectOnMeta: true, reason: 'forwarded' });
      return;
    }
    if (targets.length) {
      await this.ring(row, targets, round);
      return;
    }
    const st = await this.core.settings(row.companyId);
    const fallback = st.forwarding.noAnswer;
    if (fallback !== dest) {
      const t2 = await this.targetsFor(row, fallback, excluded);
      if (t2 && t2.length) {
        await this.ring(row, t2, round);
        return;
      }
    }
    await this.finishMissed(row, fallback, { rejectOnMeta: true, reason: 'nobody_available' });
  }

  /** Users to ring for a destination (minus `excluded`), or null for a destination that ends the call. */
  async targetsFor(row: CallRow, dest: string, excluded: Set<string>): Promise<string[] | null> {
    if (isTerminalDestination(dest)) return null;
    const keep = (ids: string[]) => ids.filter(id => !excluded.has(id));
    if (dest === 'queue' || dest === 'wait') {
      const st = await this.core.settings(row.companyId);
      return this.pickByStrategy(row.companyId, st.ringStrategy, excluded);
    }
    if (dest === 'manager') return keep(await this.core.availableUsers(row.companyId, 'manager'));
    let userId: string | null = null;
    if (dest === 'owner') {
      const [c] = await this.db.select({ owner: contacts.ownerUserId }).from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
      userId = c?.owner ?? null;
    } else if (dest.startsWith('user:')) {
      userId = dest.slice(5);
    }
    if (!userId || excluded.has(userId)) return [];
    return (await this.core.callStatusOf(row.companyId, userId)) === 'available' ? [userId] : [];
  }

  /** 'all' = every available user; 'rr' = next by round robin; 'idle' = longest since their last call. */
  private async pickByStrategy(companyId: string, strategy: 'all' | 'rr' | 'idle', excluded: Set<string>): Promise<string[]> {
    const available = (await this.core.availableUsers(companyId)).filter(id => !excluded.has(id));
    if (available.length <= 1 || strategy === 'all') return available;
    if (strategy === 'rr') {
      const [c] = await this.db
        .update(companies)
        .set({ rrCursor: sql`${companies.rrCursor} + 1` })
        .where(eq(companies.id, companyId))
        .returning({ cursor: companies.rrCursor });
      const i = ((c?.cursor ?? 1) - 1) % available.length;
      return [available[i]];
    }
    const last = await this.db
      .select({ userId: calls.handledByUserId, lastEnd: max(calls.endedAt) })
      .from(calls)
      .where(and(eq(calls.companyId, companyId), inArray(calls.handledByUserId, available)))
      .groupBy(calls.handledByUserId);
    const endBy = new Map(last.map(l => [l.userId, l.lastEnd ? new Date(l.lastEnd).getTime() : 0]));
    const sorted = [...available].sort((a, b) => (endBy.get(a) ?? 0) - (endBy.get(b) ?? 0) || a.localeCompare(b));
    return [sorted[0]];
  }

  /** Ring these users now and start the ring timer for this round. */
  async ring(row: CallRow, userIds: string[], round: number): Promise<void> {
    const [u] = await this.db
      .update(calls)
      .set({ ringingUserIds: userIds })
      .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
      .returning();
    if (!u) return;
    await this.core.event(u.companyId, u.id, 'ring', null, { round, userIds });
    const call = await this.core.presentOne(u);
    this.realtime.emit([rooms.managers(u.companyId), ...userIds.map(id => rooms.user(id))], 'call.ringing', {
      call,
      sdpOffer: u.sdpOffer,
      ivrOption: u.ivrOption
    });
    // Devices rung in an earlier round stop ringing.
    if (round > 0) await this.core.emitUpdated(u);
    await this.push.notify(userIds, call.contact.name, 'Incoming WhatsApp call', { kind: 'call', callId: u.id });
    const st = await this.core.settings(u.companyId);
    const remaining = RING_WINDOW_MS + 10_000 - (Date.now() - u.startedAt.getTime());
    const delay = Math.max(5_000, Math.min(st.ringSeconds * 1000, remaining));
    await this.queues.add('call.ring_timeout', { callId: u.id, round }, { delay, jobId: `ring-${u.id}-${round}`, attempts: 3 });
  }

  /**
   * Nobody took the call: reject it on Meta (unless Meta already ended it), mark it missed and
   * send the customer the message the destination asks for.
   */
  async finishMissed(row: CallRow, dest: string, opts: { rejectOnMeta: boolean; reason: string }): Promise<void> {
    // The AI takes calls that would be missed (not when the caller already hung up, or the AI itself failed).
    if (opts.rejectOnMeta && opts.reason !== 'ai_unavailable' && !row.handledByAi) {
      const when = await this.voicePolicy.when(row.companyId);
      if (when === 'no_answer' && (await this.handToAi(row, 'no_answer'))) return;
    }
    const [u] = await this.db
      .update(calls)
      .set({ outcome: 'missed', endedAt: new Date(), ringingUserIds: [] })
      .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
      .returning();
    if (!u) return;
    if (opts.rejectOnMeta && u.waCallId) {
      const wa = await this.whatsapp.find(u.companyId);
      if (wa) {
        try {
          await wa.graph.callAction(wa.phoneNumberId, { call_id: u.waCallId, action: 'reject' });
        } catch (err) {
          logger.warn({ err, callId: u.id }, 'Could not reject the call on WhatsApp');
        }
      }
    }
    await this.core.event(u.companyId, u.id, 'missed', null, { dest, reason: opts.reason });
    await this.core.systemLine(u.companyId, u.contactId, 'Missed call');
    await this.sendMissedCallMessage(u, dest);
    const [c] = await this.db.select().from(contacts).where(eq(contacts.id, u.contactId)).limit(1);
    if (c?.ownerUserId) {
      await this.push.notify([c.ownerUserId], 'Missed call', contactDisplayName(c), { kind: 'call', callId: u.id });
    }
    await this.core.emitUpdated(u);
  }

  private async sendMissedCallMessage(row: CallRow, dest: string): Promise<void> {
    const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
    if (!contact || contact.blockedAt) return;
    const conv = await this.inbox.ensureConversation(row.companyId, contact.id);
    const sender = { userId: null, kind: 'system' as const };
    try {
      if (dest === 'vm') {
        if (windowOpen(conv)) await this.messaging.sendFreeForm(row.companyId, conv, contact, { text: VOICE_NOTE_TEXT, fileIds: [] }, sender);
        return;
      }
      if (dest.startsWith('quick_reply:')) {
        const [qr] = await this.db
          .select()
          .from(quickReplies)
          .where(and(eq(quickReplies.id, dest.slice(12)), eq(quickReplies.companyId, row.companyId)))
          .limit(1);
        if (qr && windowOpen(conv)) {
          await this.messaging.sendFreeForm(row.companyId, conv, contact, { text: qr.text, fileIds: qr.fileIds }, sender);
          return;
        }
      }
      const rules = await this.core.assignment(row.companyId);
      if (rules.missedCallTemplateId) {
        await this.messaging.sendTemplate(row.companyId, conv, contact, { templateId: rules.missedCallTemplateId, variables: [] }, sender);
        return;
      }
      if (!windowOpen(conv)) return;
      const [bot] = await this.db
        .select({ text: aiBotSettings.missedCallMessageTemplate })
        .from(aiBotSettings)
        .where(eq(aiBotSettings.companyId, row.companyId))
        .limit(1);
      const text = bot?.text.trim() || DEFAULT_MISSED_CALL_TEXT;
      await this.messaging.sendFreeForm(row.companyId, conv, contact, { text, fileIds: [] }, sender);
    } catch (err) {
      logger.warn({ err, callId: row.id }, 'Missed-call message not sent');
    }
  }

  /* ───────── AI voice agent ───────── */

  /**
   * Give a ringing call to the AI voice agent: stop ringing people and ask the voice process to
   * answer. Returns false when the call is no longer ringing.
   */
  async handToAi(row: CallRow, why: string): Promise<boolean> {
    if (row.direction !== 'in' || !row.sdpOffer || !row.waCallId) return false;
    const [u] = await this.db
      .update(calls)
      .set({ handledByAi: true, ringingUserIds: [] })
      .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing'), eq(calls.handledByAi, false)))
      .returning();
    if (!u) return false;
    await this.core.event(u.companyId, u.id, 'ai_handoff', null, { why });
    await this.core.emitUpdated(u);
    await this.queues.add('voice.answer', { callId: u.id }, { attempts: 1, jobId: `voice-${u.id}` });
    return true;
  }

  /** The voice process could not take the call: fall back to the normal missed-call rule. */
  async aiUnavailable(callId: string, reason: string): Promise<void> {
    const [row] = await this.db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!row || row.outcome !== 'ringing') return;
    logger.warn({ callId, reason }, 'AI voice agent could not answer');
    await this.core.event(row.companyId, row.id, 'ai_failed', null, { reason });
    const st = await this.core.settings(row.companyId);
    await this.finishMissed(row, st.forwarding.noAnswer, { rejectOnMeta: true, reason: 'ai_unavailable' });
  }

  /* ───────── Business-initiated ───────── */

  /** The customer's device answered our offer: hand the SDP answer to the caller's device. */
  private async businessConnect(companyId: string, c: WaCall): Promise<void> {
    const sdp = c.session?.sdp;
    if (!sdp || (c.session?.sdp_type ?? '').toLowerCase() !== 'answer') return;
    let [row] = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.companyId, companyId), eq(calls.waCallId, c.id!)))
      .limit(1);
    const opaque = str(c.biz_opaque_callback_data);
    if (!row && opaque && /^[0-9a-f-]{36}$/i.test(opaque)) {
      [row] = await this.db
        .select()
        .from(calls)
        .where(and(eq(calls.companyId, companyId), eq(calls.id, opaque)))
        .limit(1);
      if (row && !row.waCallId) await this.db.update(calls).set({ waCallId: c.id! }).where(eq(calls.id, row.id));
    }
    if (!row || row.direction !== 'out' || !row.handledByUserId) return;
    await this.core.event(companyId, row.id, 'sdp_answer', null);
    this.realtime.emit([rooms.user(row.handledByUserId)], 'call.signal', { callId: row.id, sdpAnswer: sdp });
  }

  /* ───────── Terminate ───────── */

  private async terminate(companyId: string, c: WaCall): Promise<void> {
    const [row] = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.companyId, companyId), eq(calls.waCallId, c.id!)))
      .limit(1);
    if (!row) return;
    if (row.handledByAi) await this.voiceBus.control({ action: 'hangup', callId: row.id });
    const endedAt = unixToDate(c.end_time) ?? new Date();
    const metaDuration = c.duration !== undefined && c.duration !== null && c.duration !== '' ? Number(c.duration) : NaN;
    const duration = Number.isFinite(metaDuration) ? Math.round(metaDuration) : null;

    if (row.outcome === 'ongoing') {
      const seconds = duration ?? (row.answeredAt ? Math.round((endedAt.getTime() - row.answeredAt.getTime()) / 1000) : 0);
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'answered', endedAt, durationSeconds: seconds })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ongoing')))
        .returning();
      if (!u) return;
      await this.afterAnsweredEnd(u, seconds);
      return;
    }
    if (row.outcome === 'answered') {
      // Ended by our hang-up first; Meta's duration is the one that counts.
      if (duration !== null && duration !== row.durationSeconds) {
        const [u] = await this.db.update(calls).set({ durationSeconds: duration }).where(eq(calls.id, row.id)).returning();
        await this.core.emitUpdated(u);
      }
      return;
    }
    if (row.outcome === 'ringing' && row.direction === 'in') {
      // The customer hung up (or Meta timed out) before anyone answered.
      const st = await this.core.settings(companyId);
      await this.finishMissed(row, st.forwarding.noAnswer, { rejectOnMeta: false, reason: 'caller_ended' });
      return;
    }
    if (row.outcome === 'ringing' && row.direction === 'out') {
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'missed', endedAt })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing')))
        .returning();
      if (!u) return;
      await this.core.countUnanswered(companyId, u.contactId);
      if (u.handledByUserId) await this.core.setCallPresence(companyId, u.handledByUserId, 'available', ['oncall']);
      await this.core.event(companyId, u.id, 'unanswered', null);
      await this.core.systemLine(companyId, u.contactId, `Outgoing call not answered${u.handledByUserId ? ` · ${await this.core.userName(u.handledByUserId)}` : ''}`);
      await this.core.emitUpdated(u);
      return;
    }
    if (!row.endedAt) await this.db.update(calls).set({ endedAt }).where(eq(calls.id, row.id));
  }

  /** Shared by hang-up and the terminate webhook once an answered call is over. */
  async afterAnsweredEnd(row: CallRow, seconds: number): Promise<void> {
    if (row.direction === 'out') await this.core.resetUnanswered(row.contactId);
    if (row.handledByUserId) await this.core.setCallPresence(row.companyId, row.handledByUserId, 'available', ['oncall']);
    await this.core.event(row.companyId, row.id, 'ended', null, { seconds });
    const name = row.handledByAi ? 'AI agent' : await this.core.userName(row.handledByUserId);
    await this.core.systemLine(row.companyId, row.contactId, `Voice call · ${mmss(seconds)}${name ? ` · ${name}` : ''}`);
    await this.core.emitUpdated(row);
  }
}

