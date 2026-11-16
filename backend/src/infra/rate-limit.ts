import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppError } from '../common/errors';
import { createRedis } from './redis';

/** Fixed-window limiter in Redis, shared by every API instance. */
@Injectable()
export class RateLimiter implements OnApplicationShutdown {
  private readonly redis: Redis = createRedis();

  async hit(key: string, limit: number, windowSeconds: number, message = 'Too many attempts. Wait a few minutes and try again.'): Promise<void> {
    const k = `rl:${key}`;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.expire(k, windowSeconds);
    if (n > limit) throw new AppError('RATE_LIMITED', message);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({ providers: [RateLimiter], exports: [RateLimiter] })
export class RateLimitModule {}
