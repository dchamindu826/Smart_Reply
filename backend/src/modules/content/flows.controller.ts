import { Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Flow, flowSchema, updateFlowSchema } from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody } from '../../common/validation';
import { FlowsService } from './flows.service';

@Controller('flows')
@Roles('manager')
export class FlowsController {
  constructor(private readonly svc: FlowsService) {}

  @Get()
  list(@Auth() s: CompanySession): Promise<Flow[]> {
    return this.svc.list(s);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Flow> {
    return this.svc.get(s, id);
  }

  @Post()
  create(@Auth() s: CompanySession, @ZBody(flowSchema) body: z.infer<typeof flowSchema>): Promise<Flow> {
    return this.svc.create(s, body);
  }

  @Patch(':id')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateFlowSchema) body: z.infer<typeof updateFlowSchema>): Promise<Flow> {
    return this.svc.update(s, id, body);
  }

  @Delete(':id')
  remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.remove(s, id);
  }
}
