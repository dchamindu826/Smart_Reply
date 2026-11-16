import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import type { ServerToClientEvents } from '@smart-reply/shared';
import { createRedis } from './redis';

/** Room names. A socket joins only rooms derived from its own session (see realtime.gateway.ts). */
export const rooms = {
  company: (companyId: string) => `company:${companyId}`,
  managers: (companyId: string) => `company:${companyId}:managers`,
  user: (userId: string) => `user:${userId}`,
  admins: () => 'admins'
};

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * Pushes events to clients from the API or a worker. Uses the Redis emitter so every API
 * instance's Socket.IO server delivers it.
 */
@Injectable()
export class Realtime implements OnApplicationShutdown {
  private readonly redis: Redis = createRedis();
  private readonly emitter = new Emitter(this.redis);

  emit<E extends EventName>(roomsList: string[], event: E, payload: Payload<E>): void {
    const unique = [...new Set(roomsList)];
    if (unique.length === 0) return;
    // The emitter's typing is loose; payloads are typed by ServerToClientEvents above.
    (this.emitter.to(unique) as unknown as { emit: (e: string, p: unknown) => void }).emit(event, payload);
  }

  /** Disconnect every socket of a user (disabled, logged out everywhere). */
  disconnectUser(userId: string): void {
    this.emitter.in(rooms.user(userId)).disconnectSockets(true);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({ providers: [Realtime], exports: [Realtime] })
export class RealtimeModule {}
