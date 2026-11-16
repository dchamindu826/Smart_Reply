import { Global, Injectable, Module } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { env } from '../config';
import type { Db } from '../db/client';
import { devices, users } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';

/**
 * Push notifications to the mobile app through Expo's push service (which delivers through
 * FCM on Android and APNs on iOS). The web app gets live events over the socket instead.
 * Never put message text of other customers in a push to the wrong person: callers pass
 * only the owner's user id.
 */
@Injectable()
export class PushService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly queues: Queues
  ) {}

  async notify(userIds: string[], title: string, body: string, data: Record<string, string>): Promise<void> {
    if (userIds.length === 0) return;
    await this.queues.add('push.send', { userIds, title, body: body.slice(0, 160), data });
  }

  /** Worker side of `push.send`. */
  async deliver(job: { userIds: string[]; title: string; body: string; data: Record<string, string> }): Promise<void> {
    const prefs = await this.db.select({ id: users.id, notify: users.notify }).from(users).where(inArray(users.id, job.userIds));
    const kind = job.data.kind;
    const allowed = prefs
      .filter(p => (kind === 'call' ? p.notify.missedCall : kind === 'assigned' ? p.notify.newChat : p.notify.newMessage))
      .map(p => p.id);
    if (allowed.length === 0) return;
    const rows = await this.db.select().from(devices).where(inArray(devices.userId, allowed));
    const targets = rows.filter(r => r.platform !== 'web' && r.pushToken.startsWith('ExponentPushToken'));
    if (targets.length === 0) return;
    const messages = targets.map(t => ({ to: t.pushToken, title: job.title, body: job.body, data: job.data, sound: 'default', priority: 'high' as const, channelId: kind === 'call' ? 'calls' : 'messages' }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {})
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Expo push failed');
      throw new Error(`Expo push ${res.status}`);
    }
    const out = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
    const dead = (out.data ?? [])
      .map((d, i) => (d.details?.error === 'DeviceNotRegistered' ? targets[i]?.pushToken : null))
      .filter((x): x is string => Boolean(x));
    if (dead.length) await this.db.delete(devices).where(inArray(devices.pushToken, dead));
  }
}

@Global()
@Module({ providers: [PushService], exports: [PushService] })
export class PushCoreModule {}
