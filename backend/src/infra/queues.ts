import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { createRedis } from './redis';

/** Every background job name and its data. Workers live in `src/worker.ts`. */
export interface JobMap {
  'webhook.process': { eventId: string };
  'message.send': { messageId: string };
  'media.download': { messageId: string; waMediaId: string; companyId: string; mime: string; fileName: string | null; voice: boolean };
  'broadcast.run': { broadcastId: string };
  'ai.reply': { messageId: string };
  'automation.inbound': { messageId: string };
  'templates.sync': { companyId: string };
  'call.ring_timeout': { callId: string; round: number };
  'push.send': { userIds: string[]; title: string; body: string; data: Record<string, string> };
  'maintenance.tick': Record<string, never>;
  'maintenance.daily': Record<string, never>;
  /** Run by the voice process (`src/voice.ts`), not the worker. */
  'voice.answer': { callId: string };
  'voice.test': { testId: string; companyId: string; sdpOffer: string; mode: 'live' | 'studio' | null };
}
export type JobName = keyof JobMap;

export const QUEUE_NAMES = ['webhooks', 'outbound', 'media', 'broadcasts', 'ai', 'automation', 'maintenance', 'calls', 'push', 'voice'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const JOB_QUEUE: Record<JobName, QueueName> = {
  'webhook.process': 'webhooks',
  'message.send': 'outbound',
  'media.download': 'media',
  'broadcast.run': 'broadcasts',
  'ai.reply': 'ai',
  'automation.inbound': 'automation',
  'templates.sync': 'maintenance',
  'call.ring_timeout': 'calls',
  'push.send': 'push',
  'maintenance.tick': 'maintenance',
  'maintenance.daily': 'maintenance',
  'voice.answer': 'voice',
  'voice.test': 'voice'
};

const DEFAULTS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 }
};

@Injectable()
export class Queues implements OnApplicationShutdown {
  private readonly connection: Redis = createRedis();
  readonly queues: Record<QueueName, Queue>;

  constructor() {
    this.queues = Object.fromEntries(
      QUEUE_NAMES.map(n => [n, new Queue(n, { connection: this.connection, defaultJobOptions: DEFAULTS })])
    ) as Record<QueueName, Queue>;
  }

  async add<N extends JobName>(name: N, data: JobMap[N], opts: JobsOptions = {}): Promise<void> {
    await this.queues[JOB_QUEUE[name]].add(name, data, opts);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(Object.values(this.queues).map(q => q.close()));
    this.connection.disconnect();
  }
}

@Global()
@Module({ providers: [Queues], exports: [Queues] })
export class QueuesModule {}
