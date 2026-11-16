/**
 * Call and chat presence, and the break log that going "on break" writes.
 */
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import {
  BreakEntry,
  BreaksResponse,
  ChannelPresence,
  PRESENCE_CHANNELS,
  PresenceChannel,
  PresenceInput,
  UserBreaks
} from '@smart-reply/shared';
import type { CompanySession } from '../../common/session';
import type { Db, DbOrTx } from '../../db/client';
import { breakLog, callSettings, companies, presence, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Realtime, rooms } from '../../infra/realtime';
import { dayRange } from './time';

export type PresenceMap = Record<PresenceChannel, ChannelPresence>;
type PresenceRow = typeof presence.$inferSelect;
type BreakRow = typeof breakLog.$inferSelect;

const DEFAULT_BREAK_LIMIT = 60;

function presentChannel(row: PresenceRow | undefined, fallbackSince: Date): ChannelPresence {
  if (!row) return { status: 'away', reason: '', since: fallbackSince.toISOString(), plannedMinutes: 0 };
  return { status: row.status, reason: row.reason, since: row.since.toISOString(), plannedMinutes: row.plannedMinutes };
}

function breakMinutes(row: BreakRow, now: Date): number {
  const end = row.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - row.startedAt.getTime()) / 60_000));
}

export function presentBreak(row: BreakRow, now = new Date()): BreakEntry {
  return {
    id: row.id,
    reason: row.reason,
    scope: row.scope,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    minutes: breakMinutes(row, now)
  };
}

@Injectable()
export class PresenceService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: Realtime
  ) {}

  async timezoneOf(companyId: string, tx?: DbOrTx): Promise<string> {
    const [c] = await (tx ?? this.db).select({ tz: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1);
    return c?.tz ?? 'Asia/Colombo';
  }

  async breakLimit(companyId: string, tx?: DbOrTx): Promise<number> {
    const [cs] = await (tx ?? this.db)
      .select({ max: callSettings.breakMaxMinutes })
      .from(callSettings)
      .where(eq(callSettings.companyId, companyId))
      .limit(1);
    return cs?.max ?? DEFAULT_BREAK_LIMIT;
  }

  /** Both channels for each user. Missing rows read as "away". */
  async presenceOf(companyId: string, userIds: string[], tx?: DbOrTx): Promise<Map<string, PresenceMap>> {
    const out = new Map<string, PresenceMap>();
    if (userIds.length === 0) return out;
    const rows = await (tx ?? this.db)
      .select()
      .from(presence)
      .where(and(eq(presence.companyId, companyId), inArray(presence.userId, userIds)));
    const epoch = new Date(0);
    for (const id of userIds) {
      const mine = rows.filter(r => r.userId === id);
      out.set(id, {
        call: presentChannel(mine.find(r => r.channel === 'call'), epoch),
        chat: presentChannel(mine.find(r => r.channel === 'chat'), epoch)
      });
    }
    return out;
  }

  /**
   * Set a user's status on one or both channels. Going on break opens a break log row;
   * leaving break on every channel closes it. The caller has checked the user belongs to the company.
   */
  async set(companyId: string, userId: string, input: PresenceInput): Promise<PresenceMap> {
    const channels: PresenceChannel[] = input.channel === 'both' ? ['call', 'chat'] : [input.channel];
    const now = new Date();
    const changed = await this.db.transaction(async tx => {
      const current = await tx
        .select()
        .from(presence)
        .where(and(eq(presence.companyId, companyId), eq(presence.userId, userId)));
      const byChannel = new Map<PresenceChannel, PresenceRow>(current.map(r => [r.channel, r]));
      const touched: PresenceChannel[] = [];
      for (const channel of channels) {
        const prev = byChannel.get(channel);
        const reason = input.reason;
        const plannedMinutes = input.status === 'brk' ? input.plannedMinutes : 0;
        if (prev && prev.status === input.status && prev.reason === reason && prev.plannedMinutes === plannedMinutes) continue;
        const since = prev && prev.status === input.status ? prev.since : now;
        const [row] = await tx
          .insert(presence)
          .values({ userId, channel, companyId, status: input.status, reason, plannedMinutes, since })
          .onConflictDoUpdate({
            target: [presence.userId, presence.channel],
            set: { status: input.status, reason, plannedMinutes, since }
          })
          .returning();
        byChannel.set(channel, row);
        touched.push(channel);
      }
      await this.syncBreakLog(tx, companyId, userId, byChannel, input, now);
      return touched;
    });
    const map = (await this.presenceOf(companyId, [userId])).get(userId)!;
    for (const channel of changed) {
      this.realtime.emit([rooms.managers(companyId), rooms.user(userId)], 'presence.updated', { userId, channel, presence: map[channel] });
    }
    return map;
  }

  private async syncBreakLog(
    tx: DbOrTx,
    companyId: string,
    userId: string,
    byChannel: Map<PresenceChannel, PresenceRow>,
    input: PresenceInput,
    now: Date
  ): Promise<void> {
    const onBreak = PRESENCE_CHANNELS.filter(ch => byChannel.get(ch)?.status === 'brk');
    const open = await tx
      .select()
      .from(breakLog)
      .where(and(eq(breakLog.userId, userId), eq(breakLog.companyId, companyId), isNull(breakLog.endedAt)));
    if (onBreak.length === 0) {
      if (open.length) {
        await tx
          .update(breakLog)
          .set({ endedAt: now })
          .where(and(eq(breakLog.userId, userId), eq(breakLog.companyId, companyId), isNull(breakLog.endedAt)));
      }
      return;
    }
    const scope: BreakRow['scope'] = onBreak.length === 2 ? 'both' : onBreak[0];
    if (open.length === 0) {
      await tx.insert(breakLog).values({
        companyId,
        userId,
        reason: input.status === 'brk' ? input.reason || 'Break' : 'Break',
        scope,
        plannedMinutes: input.status === 'brk' ? input.plannedMinutes : 0,
        startedAt: now
      });
    } else if (open.some(r => r.scope !== scope)) {
      await tx
        .update(breakLog)
        .set({ scope })
        .where(and(eq(breakLog.userId, userId), eq(breakLog.companyId, companyId), isNull(breakLog.endedAt)));
    }
  }

  /** Sign-off: both channels away, any open break closed (used when a staff member is disabled). */
  async signOff(companyId: string, userId: string, tx: DbOrTx): Promise<void> {
    const now = new Date();
    await tx
      .update(presence)
      .set({ status: 'away', reason: '', plannedMinutes: 0, since: now })
      .where(and(eq(presence.companyId, companyId), eq(presence.userId, userId)));
    await tx
      .update(breakLog)
      .set({ endedAt: now })
      .where(and(eq(breakLog.companyId, companyId), eq(breakLog.userId, userId), isNull(breakLog.endedAt)));
  }

  /** Break entries started on the given local day, by user. */
  async breaksFor(
    companyId: string,
    userIds: string[],
    date?: string,
    tx?: DbOrTx
  ): Promise<{ date: string; limitMinutes: number; byUser: Map<string, { usedMinutes: number; entries: BreakEntry[] }> }> {
    const tz = await this.timezoneOf(companyId, tx);
    const range = dayRange(tz, date);
    const limitMinutes = await this.breakLimit(companyId, tx);
    const byUser = new Map<string, { usedMinutes: number; entries: BreakEntry[] }>();
    for (const id of userIds) byUser.set(id, { usedMinutes: 0, entries: [] });
    if (userIds.length === 0) return { date: range.date, limitMinutes, byUser };
    const rows = await (tx ?? this.db)
      .select()
      .from(breakLog)
      .where(
        and(
          eq(breakLog.companyId, companyId),
          inArray(breakLog.userId, userIds),
          gte(breakLog.startedAt, range.from),
          lt(breakLog.startedAt, range.to)
        )
      )
      .orderBy(asc(breakLog.startedAt));
    const now = new Date();
    for (const r of rows) {
      const slot = byUser.get(r.userId);
      if (!slot) continue;
      const entry = presentBreak(r, now);
      slot.entries.push(entry);
      slot.usedMinutes += entry.minutes;
    }
    return { date: range.date, limitMinutes, byUser };
  }

  async myBreaks(s: CompanySession): Promise<BreaksResponse> {
    const r = await this.breaksFor(s.companyId, [s.userId]);
    const mine = r.byUser.get(s.userId)!;
    return { date: r.date, limitMinutes: r.limitMinutes, usedMinutes: mine.usedMinutes, entries: mine.entries };
  }

  async companyBreaks(s: CompanySession, date?: string): Promise<UserBreaks[]> {
    const people = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.companyId, s.companyId), inArray(users.role, ['manager', 'staff']), eq(users.status, 'active')))
      .orderBy(asc(users.name));
    const r = await this.breaksFor(s.companyId, people.map(p => p.id), date);
    return people.map(p => {
      const b = r.byUser.get(p.id)!;
      return { userId: p.id, name: p.name, date: r.date, limitMinutes: r.limitMinutes, usedMinutes: b.usedMinutes, entries: b.entries };
    });
  }
}
