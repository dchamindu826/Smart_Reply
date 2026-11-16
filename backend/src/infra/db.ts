import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { env } from '../config';
import { createDb, createPool, Db } from '../db/client';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export const InjectDb = (): ParameterDecorator => Inject(DB);

class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool(env.DATABASE_URL, env.DATABASE_POOL_MAX) },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool): Db => createDb(pool) },
    PoolCloser
  ],
  exports: [DB, PG_POOL]
})
export class DbModule {}
