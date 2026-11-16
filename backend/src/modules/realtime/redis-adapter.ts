import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import { createRedis } from '../../infra/redis';

/** Lets several API instances share rooms, and lets workers emit through Redis. */
export class RedisIoAdapter extends IoAdapter {
  private adapter: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connect(): void {
    const pub = createRedis();
    const sub = pub.duplicate();
    this.adapter = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }
}
