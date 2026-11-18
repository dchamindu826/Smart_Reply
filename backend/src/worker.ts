/**
 * Background worker: webhook processing, sending, media, broadcasts, AI replies, automation,
 * call timers, push notifications and housekeeping. Run as its own process (`npm run start:worker`).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import { AutomationService } from './core/automation.service';
import { MessagingService } from './core/messaging.service';
import { PushService } from './core/push.service';
import { JobMap, JobName, Queues, QueueName } from './infra/queues';
import { createRedis } from './infra/redis';
import { logger } from './infra/logger';
import { AiEngine } from './modules/ai/ai.engine';
import { CallsEngine } from './modules/calls/calls.engine';
import { BroadcastRunner } from './modules/content/broadcast.runner';
import { TemplateSync } from './modules/content/template-sync';
import { MaintenanceService } from './worker/maintenance.service';
import { WebhookProcessor } from './worker/webhook.processor';
import { WorkerModule } from './worker/worker.module';

type Handler = (job: Job) => Promise<unknown>;

export function handlers(app: INestApplicationContext): Partial<Record<JobName, Handler>> {
  const get = <T>(cls: new (...args: never[]) => T): T => app.get(cls, { strict: false });
  return {
    'webhook.process': j => get(WebhookProcessor).process((j.data as JobMap['webhook.process']).eventId),
    'media.download': j => get(WebhookProcessor).downloadMedia(j.data as JobMap['media.download']),
    'message.send': j => get(MessagingService).deliver((j.data as JobMap['message.send']).messageId, j.attemptsMade, j.opts.attempts ?? 1),
    'automation.inbound': j => get(AutomationService).onInbound((j.data as JobMap['automation.inbound']).messageId),
    'ai.reply': j => get(AiEngine).maybeReply((j.data as JobMap['ai.reply']).messageId),
    'broadcast.run': j => get(BroadcastRunner).run((j.data as JobMap['broadcast.run']).broadcastId),
    'templates.sync': j => get(TemplateSync).syncCompany((j.data as JobMap['templates.sync']).companyId),
    'call.ring_timeout': j => {
      const d = j.data as JobMap['call.ring_timeout'];
      return get(CallsEngine).ringTimeout(d.callId, d.round);
    },
    'push.send': j => get(PushService).deliver(j.data as JobMap['push.send']),
    'maintenance.tick': () => get(MaintenanceService).tick(),
    'maintenance.daily': () => get(MaintenanceService).daily()
  };
}

/** The `voice` queue belongs to the voice process. */
const CONCURRENCY: Record<Exclude<QueueName, 'voice'>, number> = {
  webhooks: 8,
  outbound: 10,
  media: 4,
  broadcasts: 1,
  ai: 4,
  automation: 6,
  maintenance: 1,
  calls: 4,
  push: 4
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  const map = handlers(app);
  const connection = createRedis();
  const workers = (Object.keys(CONCURRENCY) as Exclude<QueueName, 'voice'>[]).map(
    name =>
      new Worker(
        name,
        async job => {
          const h = map[job.name as JobName];
          if (!h) throw new Error(`No handler for ${job.name}`);
          return h(job);
        },
        { connection, concurrency: CONCURRENCY[name] }
      )
  );
  for (const w of workers) {
    w.on('failed', (job, err) => logger.warn({ queue: w.name, job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
  }
  const queues = app.get(Queues);
  await queues.queues.maintenance.upsertJobScheduler('tick', { every: 60_000 }, { name: 'maintenance.tick', data: {} });
  await queues.queues.maintenance.upsertJobScheduler('daily', { pattern: '15 3 * * *' }, { name: 'maintenance.daily', data: {} });
  logger.info('Smart Reply worker started');

  const stop = async () => {
    logger.info('Worker stopping');
    await Promise.all(workers.map(w => w.close()));
    connection.disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

if (require.main === module) {
  main().catch(err => {
    logger.fatal({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
