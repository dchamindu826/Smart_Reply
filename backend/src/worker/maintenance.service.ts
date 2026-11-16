import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiAddons, refreshTokens, scheduledCalls, webhookEvents, whatsappAccounts, contacts, users } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';
import { Realtime, rooms } from '../infra/realtime';
import { PushService } from '../core/push.service';

/** Timed housekeeping. `tick` runs every minute, `daily` once a day. */
@Injectable()
export class MaintenanceService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly queues: Queues,
    private readonly realtime: Realtime,
    private readonly push: PushService
  ) {}

  async tick(): Promise<void> {
    await this.remindScheduledCalls();
    await this.expireAddons();
  }

  /** Remind the staff member five minutes before a scheduled call. */
  private async remindScheduledCalls(): Promise<void> {
    const soon = new Date(Date.now() + 5 * 60_000);
    const due = await this.db
      .select({ s: scheduledCalls, contactName: contacts.name, profileName: contacts.profileName })
      .from(scheduledCalls)
      .innerJoin(contacts, eq(contacts.id, scheduledCalls.contactId))
      .where(and(eq(scheduledCalls.status, 'pending'), isNull(scheduledCalls.remindedAt), lte(scheduledCalls.scheduledAt, soon)))
      .limit(200);
    for (const d of due) {
      const who = d.contactName || d.profileName || 'a customer';
      const time = d.s.scheduledAt.toISOString().slice(11, 16);
      this.realtime.emit([rooms.user(d.s.userId)], 'notice', { text: `Scheduled call with ${who} at ${time} UTC${d.s.note ? ` · ${d.s.note}` : ''}`, level: 'info' });
      await this.push.notify([d.s.userId], 'Scheduled call', `Call ${who}${d.s.note ? ` · ${d.s.note}` : ''}`, { kind: 'call', contactId: d.s.contactId });
      await this.db.update(scheduledCalls).set({ remindedAt: new Date() }).where(eq(scheduledCalls.id, d.s.id));
    }
  }

  /** Add-ons past their end date stop; the bot no longer runs for that company. */
  private async expireAddons(): Promise<void> {
    const ended = await this.db
      .update(aiAddons)
      .set({ status: 'expired' })
      .where(and(eq(aiAddons.status, 'active'), lt(aiAddons.activeUntil, new Date())))
      .returning({ companyId: aiAddons.companyId });
    for (const e of ended) {
      logger.info({ companyId: e.companyId }, 'AI add-on expired');
      this.realtime.emit([rooms.managers(e.companyId)], 'notice', { text: 'Your AI bot add-on has expired. Ask LUMI AI to renew it.', level: 'warn' });
    }
    // New month: reset usage counters.
    const month = new Date().toISOString().slice(0, 7);
    await this.db
      .update(aiAddons)
      .set({ usageMonth: month, repliesThisMonth: 0, tokensThisMonth: 0, costMinorThisMonth: 0 })
      .where(ne(aiAddons.usageMonth, month));
  }

  async daily(): Promise<void> {
    const accounts = await this.db.select({ companyId: whatsappAccounts.companyId }).from(whatsappAccounts).where(eq(whatsappAccounts.status, 'connected'));
    for (const a of accounts) await this.queues.add('templates.sync', { companyId: a.companyId }, { jobId: `tsync-${a.companyId}-${new Date().toISOString().slice(0, 10)}` });
    await this.db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, new Date(Date.now() - 30 * 86_400_000)));
    await this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    // Invites that were never accepted: nothing to do; they stop counting once expired.
    void users;
    void sql;
  }
}
