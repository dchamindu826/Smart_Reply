import IORedis, { Redis } from 'ioredis';
import { env } from '../config';

/** BullMQ needs `maxRetriesPerRequest: null`. */
export function createRedis(): Redis {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
