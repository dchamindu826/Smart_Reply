import { Global, Injectable, Module } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { env } from '../config';
import type { Db } from '../db/client';
import { devices, users } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Queues } from '../infra/queues';
import { apnsConfigured, sendVoip } from './apns';
import { fcmConfigured, sendFcm, sendFcmData } from './fcm';

/** How long an incoming-call screen may ring on the phone before it gives up by itself. */
const RING_TTL_SECONDS = 45;

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

  /**
   * Incoming call: a full-screen ringing call on the phone even when the app is closed
   * (Android: data push to the app's background handler; iOS: Apple VoIP push to CallKit).
   */
  async ringing(userIds: string[], call: { id: string; name: string; phone: string }): Promise<void> {
    if (userIds.length === 0) return;
    await this.queues.add('push.send', {
      userIds,
      title: call.name,
      body: 'Incoming WhatsApp call',
      data: { kind: 'call', ring: '1', callId: call.id, name: call.name, phone: call.phone }
    });
  }

  /** The call stopped ringing for these people (answered, missed, ended or moved on): close the ringing screen. */
  async ringStopped(userIds: string[], callId: string, key: string): Promise<void> {
    if (userIds.length === 0) return;
    // One stop per state change, however often the call is re-emitted.
    await this.queues.add(
      'push.send',
      { userIds, title: '', body: '', data: { kind: 'call_end', callId } },
      { jobId: `ringstop-${callId}-${key}` }
    );
  }

  /** Worker side of `push.send`. */
  async deliver(job: { userIds: string[]; title: string; body: string; data: Record<string, string> }): Promise<void> {
    const prefs = await this.db.select({ id: users.id, notify: users.notify }).from(users).where(inArray(users.id, job.userIds));
    const kind = job.data.kind;
    const allowed = prefs
      .filter(p => (kind === 'call_end' ? true : kind === 'call' ? p.notify.missedCall : kind === 'assigned' ? p.notify.newChat : p.notify.newMessage))
      .map(p => p.id);
    if (allowed.length === 0) return;
    const all = await this.db.select().from(devices).where(inArray(devices.userId, allowed));
    const channel = kind === 'call' ? 'calls' : 'messages';
    let rows = all;

    if (kind === 'call_end' || job.data.ring === '1') {
      rows = await this.deliverRing(all, job);
      if (kind === 'call_end') return;
    }

    // Flutter app: Firebase tokens go straight to FCM.
    const fcmTargets = rows.filter(r => r.platform !== 'web' && !r.pushToken.startsWith('ExponentPushToken'));
    if (fcmTargets.length && fcmConfigured()) {
      const deadFcm: string[] = [];
      for (const t of fcmTargets) {
        try {
          if ((await sendFcm(t.pushToken, { title: job.title, body: job.body, data: job.data, channel })) === 'unregistered') deadFcm.push(t.pushToken);
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : err }, 'FCM push failed');
        }
      }
      if (deadFcm.length) await this.db.delete(devices).where(inArray(devices.pushToken, deadFcm));
    }

    // React Native (Expo) app: Expo push tokens.
    const targets = rows.filter(r => r.platform !== 'web' && r.pushToken.startsWith('ExponentPushToken'));
    if (targets.length === 0) return;
    const messages = targets.map(t => ({ to: t.pushToken, title: job.title, body: job.body, data: job.data, sound: 'default', priority: 'high' as const, channelId: channel }));
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

  /**
   * Ring or stop ringing on the Flutter app. Returns the devices that still need an ordinary
   * notification (iOS phones without a VoIP token, and the Expo app).
   */
  private async deliverRing(rows: (typeof devices.$inferSelect)[], job: { data: Record<string, string> }): Promise<(typeof devices.$inferSelect)[]> {
    const rest: (typeof devices.$inferSelect)[] = [];
    const deadFcm: string[] = [];
    const deadVoip: string[] = [];
    const stop = job.data.kind === 'call_end';
    for (const d of rows) {
      if (d.platform === 'web' || d.pushToken.startsWith('ExponentPushToken')) {
        if (!stop) rest.push(d);
        continue;
      }
      try {
        if (d.platform === 'android') {
          if (!fcmConfigured()) continue;
          const data = { ...job.data, ttl: String(RING_TTL_SECONDS) };
          if ((await sendFcmData(d.pushToken, data, stop ? 60 : RING_TTL_SECONDS)) === 'unregistered') deadFcm.push(d.pushToken);
        } else if (d.platform === 'ios') {
          // iOS: CallKit closes the ringing screen itself once the app sees the call end (it wakes with the VoIP push).
          if (stop) continue;
          if (d.voipToken && apnsConfigured()) {
            const r = await sendVoip(d.voipToken, {
              id: job.data.callId,
              callId: job.data.callId,
              nameCaller: job.data.name ?? 'WhatsApp call',
              handle: job.data.phone ?? '',
              isVideo: false
            });
            if (r === 'unregistered') deadVoip.push(d.voipToken);
          } else {
            rest.push(d);
          }
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'Call push failed');
      }
    }
    if (deadFcm.length) await this.db.delete(devices).where(inArray(devices.pushToken, deadFcm));
    if (deadVoip.length) await this.db.update(devices).set({ voipToken: null }).where(inArray(devices.voipToken, deadVoip));
    return rest;
  }
}

@Global()
@Module({ providers: [PushService], exports: [PushService] })
export class PushCoreModule {}
