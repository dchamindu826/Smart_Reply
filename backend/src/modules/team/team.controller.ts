import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  AssignmentRules,
  BreaksResponse,
  Invite,
  KeywordRule,
  RolesResponse,
  SeatsResponse,
  StaffBrief,
  StaffMember,
  StaffSummary,
  StaffTarget,
  UserBreaks,
  assignmentRulesSchema,
  breaksQuery,
  createInviteSchema,
  keywordRuleSchema,
  presenceSchema,
  staffListQuery,
  targetsSchema,
  updateRolesSchema,
  updateStaffSchema
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { PresenceMap, PresenceService } from './presence.service';
import { RulesService } from './rules.service';
import { TeamService } from './team.service';

const keywordRulePatch = keywordRuleSchema.partial();

@Controller()
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly presence: PresenceService,
    private readonly rules: RulesService
  ) {}

  /* ───────── Staff ───────── */

  @Get('staff')
  list(@Auth() s: CompanySession, @ZQuery(staffListQuery) q: z.infer<typeof staffListQuery>): Promise<StaffMember[] | StaffBrief[]> {
    return this.team.list(s, q.include === 'disabled');
  }

  @Get('staff/invites')
  @Roles('manager')
  invites(@Auth() s: CompanySession): Promise<Invite[]> {
    return this.team.pendingInvites(s);
  }

  @Post('staff/invites')
  @Roles('manager')
  invite(@Auth() s: CompanySession, @ZBody(createInviteSchema) body: z.infer<typeof createInviteSchema>): Promise<Invite> {
    return this.team.invite(s, body);
  }

  @Post('staff/invites/:id/resend')
  @Roles('manager')
  @HttpCode(200)
  resend(@Auth() s: CompanySession, @Param('id') id: string): Promise<Invite> {
    return this.team.resendInvite(s, id);
  }

  @Delete('staff/invites/:id')
  @Roles('manager')
  @HttpCode(204)
  async cancelInvite(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.team.cancelInvite(s, id);
  }

  @Get('staff/:id/summary')
  @Roles('manager')
  summary(@Auth() s: CompanySession, @Param('id') id: string): Promise<StaffSummary> {
    return this.team.summary(s, id);
  }

  @Patch('staff/:id')
  @Roles('manager')
  update(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(updateStaffSchema) body: z.infer<typeof updateStaffSchema>): Promise<StaffMember> {
    return this.team.update(s, id, body);
  }

  @Delete('staff/:id')
  @Roles('manager')
  @HttpCode(204)
  async remove(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.team.remove(s, id);
  }

  @Put('staff/:id/presence')
  @Roles('manager')
  staffPresence(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(presenceSchema) body: z.infer<typeof presenceSchema>): Promise<PresenceMap> {
    return this.team.setPresenceFor(s, id, body);
  }

  /* ───────── Seats and roles ───────── */

  @Get('seats')
  @Roles('manager')
  seats(@Auth() s: CompanySession): Promise<SeatsResponse> {
    return this.team.seats(s);
  }

  @Get('roles')
  @Roles('manager')
  roles(@Auth() s: CompanySession): Promise<RolesResponse> {
    return this.team.roles(s);
  }

  @Patch('roles/staff')
  @Roles('manager')
  updateRoles(@Auth() s: CompanySession, @ZBody(updateRolesSchema) body: z.infer<typeof updateRolesSchema>): Promise<RolesResponse> {
    return this.team.updateRoles(s, body.staff);
  }

  /* ───────── Presence and breaks ───────── */

  @Get('presence')
  @Roles('manager')
  presenceBoard(@Auth() s: CompanySession): Promise<StaffBrief[]> {
    return this.team.presenceBoard(s);
  }

  @Put('me/presence')
  myPresence(@Auth() s: CompanySession, @ZBody(presenceSchema) body: z.infer<typeof presenceSchema>): Promise<PresenceMap> {
    return this.presence.set(s.companyId, s.userId, body);
  }

  @Get('me/breaks')
  myBreaks(@Auth() s: CompanySession): Promise<BreaksResponse> {
    return this.presence.myBreaks(s);
  }

  @Get('breaks')
  @Roles('manager')
  breaks(@Auth() s: CompanySession, @ZQuery(breaksQuery) q: z.infer<typeof breaksQuery>): Promise<UserBreaks[]> {
    return this.presence.companyBreaks(s, q.date);
  }

  /* ───────── Rules and targets ───────── */

  @Get('assignment-rules')
  @Roles('manager')
  assignment(@Auth() s: CompanySession): Promise<AssignmentRules> {
    return this.rules.assignment(s);
  }

  @Put('assignment-rules')
  @Roles('manager')
  setAssignment(@Auth() s: CompanySession, @ZBody(assignmentRulesSchema) body: z.infer<typeof assignmentRulesSchema>): Promise<AssignmentRules> {
    return this.rules.setAssignment(s, body);
  }

  @Get('keyword-rules')
  @Roles('manager')
  keywordRules(@Auth() s: CompanySession): Promise<KeywordRule[]> {
    return this.rules.keywordRules(s);
  }

  @Post('keyword-rules')
  @Roles('manager')
  createKeywordRule(@Auth() s: CompanySession, @ZBody(keywordRuleSchema) body: z.infer<typeof keywordRuleSchema>): Promise<KeywordRule> {
    return this.rules.createKeywordRule(s, body);
  }

  @Patch('keyword-rules/:id')
  @Roles('manager')
  updateKeywordRule(@Auth() s: CompanySession, @Param('id') id: string, @ZBody(keywordRulePatch) body: z.infer<typeof keywordRulePatch>): Promise<KeywordRule> {
    return this.rules.updateKeywordRule(s, id, body);
  }

  @Delete('keyword-rules/:id')
  @Roles('manager')
  @HttpCode(204)
  async deleteKeywordRule(@Auth() s: CompanySession, @Param('id') id: string): Promise<void> {
    await this.rules.deleteKeywordRule(s, id);
  }

  @Get('targets')
  @Roles('manager')
  targets(@Auth() s: CompanySession): Promise<StaffTarget[]> {
    return this.rules.targets(s);
  }

  @Put('targets')
  @Roles('manager')
  setTargets(@Auth() s: CompanySession, @ZBody(targetsSchema) body: z.infer<typeof targetsSchema>): Promise<StaffTarget[]> {
    return this.rules.setTargets(s, body.targets);
  }
}
