/**
 * Messages between the API/worker and the voice process over Redis:
 *  - control (pub/sub): "the caller hung up" / "stop this test call"
 *  - test calls: the voice process answers a browser test call; the API waits for the SDP answer
 *    on a list and reads the transcript from a key afterwards.
 */
import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createRedis } from '../infra/redis';

export const VOICE_CONTROL_CHANNEL = 'voice:control';

export interface VoiceControl {
  action: 'hangup';
  callId?: string;
  testId?: string;
}

export interface VoiceTestResult {
  status: 'connecting' | 'live' | 'ended' | 'failed';
  error?: string;
  mode?: 'live' | 'studio';
  transcript: { role: 'caller' | 'agent'; text: string; at: string }[];
  bookings: { service: string; when: string }[];
  callback: string | null;
  endReason?: string;
  seconds?: number;
}

const TEST_TTL = 3600;

@Injectable()
export class VoiceBus implements OnApplicationShutdown {
  private readonly redis: Redis = createRedis();
  private sub: Redis | null = null;

  async control(msg: VoiceControl): Promise<void> {
    await this.redis.publish(VOICE_CONTROL_CHANNEL, JSON.stringify(msg));
  }

  /** Voice process: listen for control messages. */
  async listen(handler: (msg: VoiceControl) => void): Promise<void> {
    this.sub = createRedis();
    await this.sub.subscribe(VOICE_CONTROL_CHANNEL);
    this.sub.on('message', (_channel, raw: string) => {
      try {
        handler(JSON.parse(raw) as VoiceControl);
      } catch {
        /* ignore bad messages */
      }
    });
  }

  /** Voice process → API: the SDP answer (or an error) for a test call. */
  async testAnswer(testId: string, payload: { sdpAnswer?: string; error?: string }): Promise<void> {
    const key = `voice:test:${testId}:answer`;
    await this.redis.multi().rpush(key, JSON.stringify(payload)).expire(key, 120).exec();
  }

  /** API: wait for the voice process to answer a test call. */
  async waitTestAnswer(testId: string, timeoutSec = 25): Promise<{ sdpAnswer?: string; error?: string } | null> {
    const conn = createRedis();
    try {
      const r = await conn.blpop(`voice:test:${testId}:answer`, timeoutSec);
      return r ? (JSON.parse(r[1]) as { sdpAnswer?: string; error?: string }) : null;
    } finally {
      conn.disconnect();
    }
  }

  async saveTest(testId: string, companyId: string, result: VoiceTestResult): Promise<void> {
    await this.redis.set(`voice:test:${testId}:result`, JSON.stringify({ companyId, ...result }), 'EX', TEST_TTL);
  }

  async readTest(testId: string): Promise<(VoiceTestResult & { companyId: string }) | null> {
    const raw = await this.redis.get(`voice:test:${testId}:result`);
    return raw ? (JSON.parse(raw) as VoiceTestResult & { companyId: string }) : null;
  }

  /** Voice process: "I am running" (shown in the admin console). */
  async heartbeat(info: { activeCalls: number; publicIp: string; ports: string }): Promise<void> {
    await this.redis.set('voice:alive', JSON.stringify({ ...info, at: new Date().toISOString() }), 'EX', 30);
  }

  async status(): Promise<{ online: boolean; activeCalls: number; publicIp: string; ports: string }> {
    const raw = await this.redis.get('voice:alive');
    if (!raw) return { online: false, activeCalls: 0, publicIp: '', ports: '' };
    const v = JSON.parse(raw) as { activeCalls: number; publicIp: string; ports: string };
    return { online: true, activeCalls: v.activeCalls, publicIp: v.publicIp, ports: v.ports };
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
    this.sub?.disconnect();
  }
}

@Global()
@Module({ providers: [VoiceBus], exports: [VoiceBus] })
export class VoiceBusModule {}
