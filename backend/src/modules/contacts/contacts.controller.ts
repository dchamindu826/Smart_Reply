import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  Call,
  Contact,
  ContactImportResult,
  Label,
  OwnerHistoryEntry,
  Page,
  bulkOwnerSchema,
  contactListQuery,
  createContactSchema,
  importContactsSchema,
  labelSchema,
  setLabelsSchema,
  setOwnerSchema,
  updateContactSchema
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { ContactsService } from './contacts.service';
import { LabelsService } from './labels.service';

const labelPatch = labelSchema.partial();

@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Get()
  list(@Auth() s: CompanySession, @ZQuery(contactListQuery) q: z.infer<typeof contactListQuery>): Promise<Page<Contact>> {
    return this.svc.list(s, q);
  }

  @Post()
  create(@Auth() s: CompanySession, @ZBody(createContactSchema) body: z.infer<typeof createContactSchema>): Promise<Contact> {
    return this.svc.create(s, body);
  }

  @Post('import')
  @Roles('manager')
  @HttpCode(200)
  import(@Auth() s: CompanySession, @ZBody(importContactsSchema) body: z.infer<typeof importContactsSchema>): Promise<ContactImportResult> {
    return this.svc.import(s, body.rows);
  }

  @Post('bulk/owner')
  @Roles('manager')
  @HttpCode(200)
  bulkOwner(@Auth() s: CompanySession, @ZBody(bulkOwnerSchema) body: z.infer<typeof bulkOwnerSchema>): Promise<{ changed: number }> {
    return this.svc.bulkOwner(s, body.contactIds, body.ownerUserId, body.reason);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Contact> {
    return this.svc.get(s, id);
  }

  @Patch(':id')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateContactSchema) body: z.infer<typeof updateContactSchema>): Promise<Contact> {
    return this.svc.update(s, id, body);
  }

  @Put(':id/owner')
  owner(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(setOwnerSchema) body: z.infer<typeof setOwnerSchema>): Promise<Contact> {
    return this.svc.setOwner(s, id, body.ownerUserId, body.reason);
  }

  @Get(':id/owner-history')
  ownerHistory(@Auth() s: CompanySession, @Param('id') id: string): Promise<OwnerHistoryEntry[]> {
    return this.svc.ownerHistory(s, id);
  }

  @Put(':id/labels')
  labels(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(setLabelsSchema) body: z.infer<typeof setLabelsSchema>): Promise<Contact> {
    return this.svc.setLabels(s, id, body.labelIds);
  }

  @Post(':id/block')
  @HttpCode(200)
  block(@Auth() s: CompanySession, @Param('id') id: string): Promise<Contact> {
    return this.svc.setBlocked(s, id, true);
  }

  @Delete(':id/block')
  unblock(@Auth() s: CompanySession, @Param('id') id: string): Promise<Contact> {
    return this.svc.setBlocked(s, id, false);
  }

  @Get(':id/calls')
  calls(@Auth() s: CompanySession, @Param('id') id: string): Promise<Call[]> {
    return this.svc.calls(s, id);
  }

  @Post(':id/call-permission-request')
  @HttpCode(200)
  callPermission(@Auth() s: CompanySession, @Param('id') id: string): Promise<Contact> {
    return this.svc.requestCallPermission(s, id);
  }
}

@Controller('labels')
export class LabelsController {
  constructor(private readonly svc: LabelsService) {}

  @Get()
  list(@Auth() s: CompanySession): Promise<Label[]> {
    return this.svc.list(s);
  }

  @Post()
  @Roles('manager')
  create(@Auth() s: CompanySession, @ZBody(labelSchema) body: z.infer<typeof labelSchema>): Promise<Label> {
    return this.svc.create(s, body);
  }

  @Patch(':id')
  @Roles('manager')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(labelPatch) body: z.infer<typeof labelPatch>): Promise<Label> {
    return this.svc.update(s, id, body);
  }

  @Delete(':id')
  @Roles('manager')
  @HttpCode(204)
  async remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.svc.remove(s, id);
  }
}
