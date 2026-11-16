import { Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  ActiveCalls,
  Call,
  CallSettings,
  ForwardingRules,
  IvrMenu,
  IvrTestResult,
  Page,
  ScheduledCall,
  answerCallSchema,
  callListQuery,
  callNoteSchema,
  callSettingsSchema,
  declineCallSchema,
  forwardCallSchema,
  forwardingSchema,
  ivrSchema,
  ivrTestSchema,
  scheduledCallSchema,
  startCallSchema
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { CallSettingsService } from './call-settings.service';
import { CallsService } from './calls.service';

@Controller('calls')
export class CallsController {
  constructor(private readonly svc: CallsService) {}

  @Get()
  list(@Auth() s: CompanySession, @ZQuery(callListQuery) q: z.infer<typeof callListQuery>): Promise<Page<Call>> {
    return this.svc.list(s, q);
  }

  @Get('active')
  active(@Auth() s: CompanySession): Promise<ActiveCalls> {
    return this.svc.active(s);
  }

  @Post()
  start(@Auth() s: CompanySession, @ZBody(startCallSchema) body: z.infer<typeof startCallSchema>): Promise<Call> {
    return this.svc.start(s, body.contactId, body.sdpOffer);
  }

  @Get(':id')
  get(@Auth() s: CompanySession, @Param('id') id: string): Promise<Call> {
    return this.svc.get(s, id);
  }

  @Post(':id/answer')
  @HttpCode(200)
  answer(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(answerCallSchema) body: z.infer<typeof answerCallSchema>): Promise<Call> {
    return this.svc.answer(s, id, body.sdpAnswer);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(declineCallSchema) body: z.infer<typeof declineCallSchema>): Promise<Call> {
    return this.svc.decline(s, id, body.messageText);
  }

  @Post(':id/hangup')
  @HttpCode(200)
  hangup(@Auth() s: CompanySession, @Param('id') id: string): Promise<Call> {
    return this.svc.hangup(s, id);
  }

  @Post(':id/forward')
  @HttpCode(200)
  forward(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(forwardCallSchema) body: z.infer<typeof forwardCallSchema>): Promise<Call> {
    return this.svc.forward(s, id, body.destination);
  }

  @Post(':id/notes')
  @HttpCode(200)
  note(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(callNoteSchema) body: z.infer<typeof callNoteSchema>): Promise<Call> {
    return this.svc.note(s, id, body.note);
  }

  @Post(':id/summary-to-chat')
  @HttpCode(200)
  summary(@Auth() s: CompanySession, @Param('id') id: string): Promise<Call> {
    return this.svc.summaryToChat(s, id);
  }

  @Post(':id/mute')
  @HttpCode(204)
  async mute(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.svc.mute(s, id, true);
  }

  @Post(':id/unmute')
  @HttpCode(204)
  async unmute(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.svc.mute(s, id, false);
  }

  @Post(':id/hold')
  hold(@Auth() s: CompanySession, @Param('id') id: string): Promise<never> {
    return this.svc.stageB(s, id);
  }

  @Post(':id/resume')
  resume(@Auth() s: CompanySession, @Param('id') id: string): Promise<never> {
    return this.svc.stageB(s, id);
  }

  @Post(':id/transfer')
  transfer(@Auth() s: CompanySession, @Param('id') id: string): Promise<never> {
    return this.svc.stageB(s, id);
  }

  @Post(':id/participants')
  participants(@Auth() s: CompanySession, @Param('id') id: string): Promise<never> {
    return this.svc.stageB(s, id);
  }

  @Post(':id/recording')
  recording(@Auth() s: CompanySession, @Param('id') id: string): Promise<never> {
    return this.svc.stageB(s, id);
  }
}

@Controller('scheduled-calls')
export class ScheduledCallsController {
  constructor(private readonly svc: CallsService) {}

  @Get()
  list(@Auth() s: CompanySession): Promise<ScheduledCall[]> {
    return this.svc.listScheduled(s);
  }

  @Post()
  create(@Auth() s: CompanySession, @ZBody(scheduledCallSchema) body: z.infer<typeof scheduledCallSchema>): Promise<ScheduledCall> {
    return this.svc.createScheduled(s, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.svc.cancelScheduled(s, id);
  }

  @Post(':id/done')
  @HttpCode(200)
  done(@Auth() s: CompanySession, @Param('id') id: string): Promise<ScheduledCall> {
    return this.svc.doneScheduled(s, id);
  }
}

@Controller()
export class CallSettingsController {
  constructor(private readonly svc: CallSettingsService) {}

  @Get('call-settings')
  @Roles('manager')
  get(@Auth() s: CompanySession): Promise<CallSettings> {
    return this.svc.get(s);
  }

  @Put('call-settings')
  @Roles('manager')
  put(@Auth() s: CompanySession, @ZBody(callSettingsSchema) body: z.infer<typeof callSettingsSchema>): Promise<CallSettings> {
    return this.svc.put(s, body);
  }

  @Post('call-settings/enable-calling')
  @Roles('manager')
  @HttpCode(200)
  enable(@Auth() s: CompanySession): Promise<CallSettings> {
    return this.svc.enableCalling(s);
  }

  @Get('forwarding')
  @Roles('manager')
  forwarding(@Auth() s: CompanySession): Promise<ForwardingRules> {
    return this.svc.getForwarding(s);
  }

  @Put('forwarding')
  @Roles('manager')
  putForwarding(@Auth() s: CompanySession, @ZBody(forwardingSchema) body: z.infer<typeof forwardingSchema>): Promise<ForwardingRules> {
    return this.svc.putForwarding(s, body);
  }

  @Get('me/forwarding')
  mine(@Auth() s: CompanySession): Promise<ForwardingRules> {
    return this.svc.getMine(s);
  }

  @Put('me/forwarding')
  putMine(@Auth() s: CompanySession, @ZBody(forwardingSchema) body: z.infer<typeof forwardingSchema>): Promise<ForwardingRules> {
    return this.svc.putMine(s, body);
  }

  @Get('ivr')
  @Roles('manager')
  ivr(@Auth() s: CompanySession): Promise<IvrMenu> {
    return this.svc.getIvr(s);
  }

  @Put('ivr')
  @Roles('manager')
  putIvr(@Auth() s: CompanySession, @ZBody(ivrSchema) body: z.infer<typeof ivrSchema>): Promise<IvrMenu> {
    return this.svc.putIvr(s, body);
  }

  @Post('ivr/test')
  @Roles('manager')
  @HttpCode(200)
  testIvr(@Auth() s: CompanySession, @ZBody(ivrTestSchema) body: z.infer<typeof ivrTestSchema>): Promise<IvrTestResult> {
    return this.svc.testIvr(s, body.keys);
  }
}
