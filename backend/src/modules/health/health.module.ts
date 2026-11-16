import { Controller, Get, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/decorators';
import type { Db } from '../../db/client';
import { InjectDb } from '../../infra/db';

@Controller()
class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Public()
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }

  /** Ready when the database answers. Used by Docker health checks. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ ok: true }> {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
