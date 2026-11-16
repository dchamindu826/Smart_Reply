import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AiAddon, AiBotLog, AiBotSettingsSummary, activationRequestSchema, aiLogsQuery } from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { AiService } from './ai.service';

/**
 * Manager's read-only view of the AI bot. Activation, settings, training and the simulator
 * are under `/admin` only (AGENTS.md rule 11): do not add a write route here.
 */
@Roles('manager')
@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Get('status')
  status(@Auth() s: CompanySession): Promise<AiAddon> {
    return this.svc.status(s);
  }

  @Get('settings')
  settings(@Auth() s: CompanySession): Promise<AiBotSettingsSummary> {
    return this.svc.settings(s);
  }

  @Get('logs')
  logs(@Auth() s: CompanySession, @ZQuery(aiLogsQuery) q: z.infer<typeof aiLogsQuery>): Promise<AiBotLog[]> {
    return this.svc.logs(s, q.channel);
  }

  @Post('activation-request')
  @HttpCode(200)
  request(@Auth() s: CompanySession, @ZBody(activationRequestSchema) body: z.infer<typeof activationRequestSchema>): Promise<AiAddon> {
    return this.svc.requestActivation(s, body.message);
  }
}
