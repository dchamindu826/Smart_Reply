import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Template, createTemplateSchema, templateListQuery } from '@smart-reply/shared';
import { Auth, Perm, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list(@Auth() s: CompanySession, @ZQuery(templateListQuery) q: z.infer<typeof templateListQuery>): Promise<Template[]> {
    return this.svc.list(s, q.status);
  }

  @Post('sync')
  @HttpCode(200)
  @Roles('manager')
  sync(@Auth() s: CompanySession): Promise<{ updated: number }> {
    return this.svc.syncNow(s);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Template> {
    return this.svc.get(s, id);
  }

  @Post()
  @Perm('createTemplates')
  create(@Auth() s: CompanySession, @ZBody(createTemplateSchema) body: z.infer<typeof createTemplateSchema>): Promise<Template> {
    return this.svc.create(s, body);
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  @Perm('createTemplates')
  resubmit(@Auth() s: CompanySession, @Param('id') id: string): Promise<Template> {
    return this.svc.resubmit(s, id);
  }

  @Delete(':id')
  @Perm('createTemplates')
  remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.remove(s, id);
  }
}
