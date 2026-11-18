/**
 * LUMI AI system admin console. Every route here is `system_admin` only (class-level @Roles).
 * WhatsApp connection and the AI bot are configured only here (AGENTS.md rule 11).
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  addManagerSchema,
  aiAddonPlanSchema,
  aiSettingsSchema,
  createCompanySchema,
  embeddedSignupSchema,
  exampleFromLogSchema,
  impersonateSchema,
  knowledgeSchema,
  manualWhatsappSchema,
  planSchema,
  platformAiSchema,
  platformMetaSchema,
  platformWebhookSchema,
  setAiAddonSchema,
  simulateSchema,
  trainingExampleSchema,
  updateCompanySchema,
  updateCompanyUserSchema,
  voicePreviewSchema,
  voiceTestSchema,
  webhookEventsQuery
} from '@smart-reply/shared';
import type {
  VoiceServerStatus,
  VoiceTestState,
  AdminAiCompanyRow,
  AdminAuditEntry,
  AdminCompany,
  AdminCompanyCreated,
  AdminCompanyUser,
  AdminHealth,
  AdminUsageRow,
  AiAddon,
  AiAddonPlan,
  AiBotLog,
  AiBotSettings,
  AiSimulateResponse,
  ConnectLinkResponse,
  Invite,
  KnowledgeDocument,
  LoginResponse,
  Plan,
  PlatformAiSettings,
  PlatformMetaSettings,
  PlatformWebhookSettings,
  TrainingExample,
  WebhookEventRow,
  WhatsappAccountAdminView,
  WhatsappConnectResponse
} from '@smart-reply/shared';
import { AnyAuth, Roles } from '../../common/decorators';
import type { Session } from '../../common/session';
import { parse, ZBody, ZQuery } from '../../common/validation';
import { AuthService } from '../auth/auth.service';
import { setAuthCookies } from '../auth/auth.controller';
import { AiAdminService } from './ai-admin.service';
import { VoiceAdminService } from './voice-admin.service';
import { CompaniesService } from './companies.service';
import { OpsService } from './ops.service';
import { PlatformAdminService } from './platform.service';
import { WhatsappConnectService } from './whatsapp-connect.service';

function clientOf(req: Request): 'web' | 'mobile' {
  return req.headers['x-sr-client'] === 'mobile' ? 'mobile' : 'web';
}

@Roles('system_admin')
@Controller('admin')
export class AdminCompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly auth: AuthService
  ) {}

  @Get('companies')
  list(): Promise<AdminCompany[]> {
    return this.companies.present();
  }

  @Post('companies')
  create(@AnyAuth() s: Session, @ZBody(createCompanySchema) body: z.infer<typeof createCompanySchema>): Promise<AdminCompanyCreated> {
    return this.companies.create(s, body);
  }

  @Get('companies/:id')
  one(@Param('id') id: string): Promise<AdminCompany> {
    return this.companies.one(id);
  }

  @Patch('companies/:id')
  update(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(updateCompanySchema) body: z.infer<typeof updateCompanySchema>): Promise<AdminCompany> {
    return this.companies.update(s, id, body);
  }

  @Post('companies/:id/suspend')
  @HttpCode(200)
  suspend(@AnyAuth() s: Session, @Param('id') id: string): Promise<AdminCompany> {
    return this.companies.setStatus(s, id, 'suspended');
  }

  @Post('companies/:id/activate')
  @HttpCode(200)
  activate(@AnyAuth() s: Session, @Param('id') id: string): Promise<AdminCompany> {
    return this.companies.setStatus(s, id, 'active');
  }

  @Get('companies/:id/users')
  users(@Param('id') id: string): Promise<AdminCompanyUser[]> {
    return this.companies.users(id);
  }

  @Post('companies/:id/managers')
  addManager(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(addManagerSchema) body: z.infer<typeof addManagerSchema>): Promise<Invite> {
    return this.companies.addManager(s, id, body);
  }

  @Patch('companies/:id/users/:userId')
  updateUser(
    @AnyAuth() s: Session,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @ZBody(updateCompanyUserSchema) body: z.infer<typeof updateCompanyUserSchema>
  ): Promise<AdminCompanyUser> {
    return this.companies.updateUser(s, id, userId, body);
  }

  @Post('companies/:id/impersonate')
  @HttpCode(200)
  async impersonate(
    @AnyAuth() s: Session,
    @Param('id') id: string,
    @ZBody(impersonateSchema) body: z.infer<typeof impersonateSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const client = clientOf(req);
    const result = await this.companies.impersonate(s, id, body.reason, client);
    if (client === 'web') setAuthCookies(res, result.tokens);
    return this.auth.toLoginResponse(result, client);
  }
}

@Roles('system_admin')
@Controller('admin')
export class AdminPlatformController {
  constructor(private readonly svc: PlatformAdminService) {}

  @Get('plans')
  plans(): Promise<Plan[]> {
    return this.svc.plans();
  }

  @Post('plans')
  createPlan(@AnyAuth() s: Session, @ZBody(planSchema) body: z.infer<typeof planSchema>): Promise<Plan> {
    return this.svc.createPlan(s, body);
  }

  @Patch('plans/:id')
  updatePlan(@AnyAuth() s: Session, @Param('id') id: string, @Body() raw: unknown): Promise<Plan> {
    return this.svc.updatePlan(s, id, parse(planSchema.partial(), raw ?? {}));
  }

  @Get('platform/meta')
  meta(): Promise<PlatformMetaSettings> {
    return this.svc.meta();
  }

  @Put('platform/meta')
  saveMeta(@AnyAuth() s: Session, @ZBody(platformMetaSchema) body: z.infer<typeof platformMetaSchema>): Promise<PlatformMetaSettings> {
    return this.svc.saveMeta(s, body);
  }

  @Post('platform/meta/test')
  @HttpCode(200)
  testMeta(): Promise<{ ok: boolean; message: string }> {
    return this.svc.testMeta();
  }

  @Get('platform/webhook')
  webhook(): Promise<PlatformWebhookSettings> {
    return this.svc.webhook();
  }

  @Put('platform/webhook')
  saveWebhook(@AnyAuth() s: Session, @ZBody(platformWebhookSchema) body: z.infer<typeof platformWebhookSchema>): Promise<PlatformWebhookSettings> {
    return this.svc.saveWebhook(s, body);
  }

  @Post('platform/webhook/test')
  @HttpCode(200)
  testWebhook(@AnyAuth() s: Session): Promise<{ ok: boolean; stored: number }> {
    return this.svc.testWebhook(s);
  }

  @Get('webhook-events')
  events(@ZQuery(webhookEventsQuery) q: z.infer<typeof webhookEventsQuery>): Promise<WebhookEventRow[]> {
    return this.svc.events(q);
  }

  @Post('webhook-events/:id/replay')
  @HttpCode(200)
  replay(@AnyAuth() s: Session, @Param('id') id: string): Promise<{ ok: true }> {
    return this.svc.replay(s, id);
  }

  @Get('ai/platform')
  ai(): Promise<PlatformAiSettings> {
    return this.svc.ai();
  }

  @Put('ai/platform')
  saveAi(@AnyAuth() s: Session, @ZBody(platformAiSchema) body: z.infer<typeof platformAiSchema>): Promise<PlatformAiSettings> {
    return this.svc.saveAi(s, body);
  }

  @Get('ai/addon-plans')
  addonPlans(): Promise<AiAddonPlan[]> {
    return this.svc.addonPlans();
  }

  @Post('ai/addon-plans')
  createAddonPlan(@AnyAuth() s: Session, @ZBody(aiAddonPlanSchema) body: z.infer<typeof aiAddonPlanSchema>): Promise<AiAddonPlan> {
    return this.svc.createAddonPlan(s, body);
  }

  @Patch('ai/addon-plans/:id')
  updateAddonPlan(@AnyAuth() s: Session, @Param('id') id: string, @Body() raw: unknown): Promise<AiAddonPlan> {
    return this.svc.updateAddonPlan(s, id, parse(aiAddonPlanSchema.partial(), raw ?? {}));
  }
}

@Roles('system_admin')
@Controller('admin/companies/:id/whatsapp')
export class AdminWhatsappController {
  constructor(private readonly svc: WhatsappConnectService) {}

  @Get()
  view(@Param('id') id: string): Promise<WhatsappAccountAdminView> {
    return this.svc.view(id);
  }

  @Post('connect')
  @HttpCode(200)
  connect(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(embeddedSignupSchema) body: z.infer<typeof embeddedSignupSchema>): Promise<WhatsappConnectResponse> {
    return this.svc.connectEmbedded(s, id, body);
  }

  @Put()
  manual(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(manualWhatsappSchema) body: z.infer<typeof manualWhatsappSchema>): Promise<WhatsappConnectResponse> {
    return this.svc.connectManual(s, id, body);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@AnyAuth() s: Session, @Param('id') id: string): Promise<WhatsappAccountAdminView> {
    return this.svc.verify(s, id);
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@AnyAuth() s: Session, @Param('id') id: string): Promise<WhatsappAccountAdminView> {
    return this.svc.subscribe(s, id);
  }

  @Post('disconnect')
  @HttpCode(200)
  disconnect(@AnyAuth() s: Session, @Param('id') id: string): Promise<WhatsappAccountAdminView> {
    return this.svc.disconnect(s, id);
  }

  @Post('connect-link')
  link(@AnyAuth() s: Session, @Param('id') id: string): Promise<ConnectLinkResponse> {
    return this.svc.createLink(s, id);
  }
}

@Roles('system_admin')
@Controller('admin')
export class AdminAiController {
  constructor(private readonly svc: AiAdminService) {}

  @Get('ai/companies')
  companies(): Promise<AdminAiCompanyRow[]> {
    return this.svc.companiesList();
  }

  @Get('ai/logs')
  allLogs(): Promise<AiBotLog[]> {
    return this.svc.logs(null);
  }

  @Put('companies/:id/ai/addon')
  setAddon(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(setAiAddonSchema) body: z.infer<typeof setAiAddonSchema>): Promise<AiAddon> {
    return this.svc.setAddon(s, id, body);
  }

  @Get('companies/:id/ai/settings')
  settings(@Param('id') id: string): Promise<AiBotSettings> {
    return this.svc.settings(id);
  }

  @Put('companies/:id/ai/settings')
  saveSettings(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(aiSettingsSchema) body: z.infer<typeof aiSettingsSchema>): Promise<AiBotSettings> {
    return this.svc.saveSettings(s, id, body);
  }

  @Get('companies/:id/ai/knowledge')
  knowledge(@Param('id') id: string): Promise<KnowledgeDocument[]> {
    return this.svc.knowledge(id);
  }

  @Post('companies/:id/ai/knowledge')
  addKnowledge(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(knowledgeSchema) body: z.infer<typeof knowledgeSchema>): Promise<KnowledgeDocument> {
    return this.svc.addKnowledge(s, id, body);
  }

  @Delete('companies/:id/ai/knowledge/:docId')
  @HttpCode(204)
  async removeKnowledge(@AnyAuth() s: Session, @Param('id') id: string, @Param('docId') docId: string): Promise<void> {
    await this.svc.removeKnowledge(s, id, docId);
  }

  @Get('companies/:id/ai/examples')
  examples(@Param('id') id: string): Promise<TrainingExample[]> {
    return this.svc.examples(id);
  }

  @Post('companies/:id/ai/examples')
  addExample(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(trainingExampleSchema) body: z.infer<typeof trainingExampleSchema>): Promise<TrainingExample> {
    return this.svc.addExample(s, id, body);
  }

  @Post('companies/:id/ai/examples/from-log/:logId')
  fromLog(
    @AnyAuth() s: Session,
    @Param('id') id: string,
    @Param('logId') logId: string,
    @ZBody(exampleFromLogSchema) body: z.infer<typeof exampleFromLogSchema>
  ): Promise<TrainingExample> {
    return this.svc.exampleFromLog(s, id, logId, body.idealAnswer);
  }

  @Delete('companies/:id/ai/examples/:exampleId')
  @HttpCode(204)
  async removeExample(@AnyAuth() s: Session, @Param('id') id: string, @Param('exampleId') exampleId: string): Promise<void> {
    await this.svc.removeExample(s, id, exampleId);
  }

  @Post('companies/:id/ai/simulate')
  @HttpCode(200)
  simulate(@Param('id') id: string, @ZBody(simulateSchema) body: z.infer<typeof simulateSchema>): Promise<AiSimulateResponse> {
    return this.svc.simulate(id, body.message, body.history);
  }

  @Get('companies/:id/ai/logs')
  logs(@Param('id') id: string): Promise<AiBotLog[]> {
    return this.svc.logs(id);
  }
}

@Roles('system_admin')
@Controller('admin')
export class AdminOpsController {
  constructor(private readonly svc: OpsService) {}

  @Get('usage')
  usage(): Promise<AdminUsageRow[]> {
    return this.svc.usage();
  }

  @Get('health')
  health(): Promise<AdminHealth> {
    return this.svc.health();
  }

  @Get('audit')
  audit(): Promise<AdminAuditEntry[]> {
    return this.svc.audit();
  }
}

/** The AI voice agent: voice preview and browser test calls (system admin only). */
@Roles('system_admin')
@Controller('admin')
export class AdminVoiceController {
  constructor(private readonly svc: VoiceAdminService) {}

  @Get('ai/voice/status')
  status(): Promise<VoiceServerStatus> {
    return this.svc.status();
  }

  @Post('companies/:id/ai/voice/preview')
  @HttpCode(200)
  async preview(@Param('id') id: string, @ZBody(voicePreviewSchema) body: z.infer<typeof voicePreviewSchema>, @Res() res: Response): Promise<void> {
    const audio = await this.svc.preview(id, body);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }

  @Post('companies/:id/ai/voice/test')
  @HttpCode(200)
  startTest(@AnyAuth() s: Session, @Param('id') id: string, @ZBody(voiceTestSchema) body: z.infer<typeof voiceTestSchema>): Promise<{ testId: string; sdpAnswer: string }> {
    return this.svc.startTest(s, id, body);
  }

  @Get('companies/:id/ai/voice/test/:testId')
  test(@Param('id') id: string, @Param('testId') testId: string): Promise<VoiceTestState> {
    return this.svc.test(id, testId);
  }

  @Post('companies/:id/ai/voice/test/:testId/hangup')
  @HttpCode(200)
  hangupTest(@Param('id') id: string, @Param('testId') testId: string): Promise<{ ok: true }> {
    return this.svc.hangupTest(id, testId);
  }
}
