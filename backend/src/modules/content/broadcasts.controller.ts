import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Broadcast, broadcastSchema } from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody } from '../../common/validation';
import { BroadcastsService } from './broadcasts.service';

@Controller('broadcasts')
@Roles('manager')
export class BroadcastsController {
  constructor(private readonly svc: BroadcastsService) {}

  @Get()
  list(@Auth() s: CompanySession): Promise<Broadcast[]> {
    return this.svc.list(s);
  }

  @Post()
  create(@Auth() s: CompanySession, @ZBody(broadcastSchema) body: z.infer<typeof broadcastSchema>): Promise<Broadcast> {
    return this.svc.create(s, body);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Broadcast> {
    return this.svc.get(s, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  send(@Auth() s: CompanySession, @Param('id') id: string): Promise<Broadcast> {
    return this.svc.send(s, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Auth() s: CompanySession, @Param('id') id: string): Promise<Broadcast> {
    return this.svc.cancel(s, id);
  }
}
