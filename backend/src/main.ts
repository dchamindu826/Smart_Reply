import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config';
import { AppModule } from './app.module';
import { logger } from './infra/logger';
import { RedisIoAdapter } from './modules/realtime/redis-adapter';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: false,
    logger: ['error', 'warn']
  });
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '5mb' });
  const origins = [env.APP_URL, ...env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)];
  app.enableCors({ origin: origins, credentials: true, exposedHeaders: ['Content-Disposition'] });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  const io = new RedisIoAdapter(app);
  io.connect();
  app.useWebSocketAdapter(io);
  app.enableShutdownHooks();
  return app;
}

async function main(): Promise<void> {
  const app = await createApp();
  await app.listen(env.PORT, '0.0.0.0');
  logger.info(`Smart Reply API listening on :${env.PORT}`);
}

if (require.main === module) {
  main().catch(err => {
    logger.fatal({ err }, 'API failed to start');
    process.exit(1);
  });
}
