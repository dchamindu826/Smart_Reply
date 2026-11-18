/**
 * Voice process: the AI voice agent that answers WhatsApp calls (Stage B media).
 * Run it as its own process (`npm run start:voice`) on a machine whose UDP ports
 * VOICE_PORT_MIN–VOICE_PORT_MAX are reachable from the internet. One process is enough for
 * VOICE_MAX_CALLS calls at a time.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { env } from './config';
import type { JobMap } from './infra/queues';
import { createRedis } from './infra/redis';
import { logger } from './infra/logger';
import { VoiceAgent } from './voice/agent.service';
import { VoiceBus } from './voice/bus';
import { VoiceProcessModule } from './voice/voice.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(VoiceProcessModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  const agent = app.get(VoiceAgent, { strict: false });
  const bus = app.get(VoiceBus, { strict: false });
  await bus.listen(msg => agent.onControl(msg));
  const connection = createRedis();
  const worker = new Worker(
    'voice',
    async job => {
      if (job.name === 'voice.answer') return agent.answerCall((job.data as JobMap['voice.answer']).callId);
      if (job.name === 'voice.test') return agent.testCall(job.data as JobMap['voice.test']);
      throw new Error(`No handler for ${job.name}`);
    },
    // Each job only sets a call up; the call itself runs on after the job finishes.
    { connection, concurrency: Math.max(4, Math.min(env.VOICE_MAX_CALLS, 20)) }
  );
  const beat = () =>
    bus
      .heartbeat({ activeCalls: agent.active, publicIp: env.VOICE_PUBLIC_IP, ports: `${env.VOICE_PORT_MIN}-${env.VOICE_PORT_MAX}` })
      .catch(err => logger.warn({ err: err instanceof Error ? err.message : err }, 'Voice heartbeat failed'));
  void beat();
  const beatTimer = setInterval(() => void beat(), 10_000);
  worker.on('failed', (job, err) => logger.warn({ job: job?.name, id: job?.id, err: err.message }, 'Voice job failed'));
  logger.info(
    { publicIp: env.VOICE_PUBLIC_IP || '(machine addresses)', ports: `${env.VOICE_PORT_MIN}-${env.VOICE_PORT_MAX}`, maxCalls: env.VOICE_MAX_CALLS },
    'Smart Reply voice agent started'
  );

  const stop = async () => {
    logger.info('Voice process stopping');
    clearInterval(beatTimer);
    await worker.close();
    await agent.stopAll();
    connection.disconnect();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
  process.on('unhandledRejection', (err) => {
    logger.warn({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'Unhandled promise rejection in voice process');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'Uncaught exception in voice process');
  });
}

if (require.main === module) {
  main().catch(err => {
    logger.fatal({ err }, 'Voice process failed to start');
    process.exit(1);
  });
}
