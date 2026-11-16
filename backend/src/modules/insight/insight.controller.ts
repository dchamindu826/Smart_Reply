import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  AuditEntry,
  BusinessProfile,
  DashboardResponse,
  ExportResponse,
  IntegrationStatus,
  IntegrationTestResponse,
  Invoice,
  MyDashboardResponse,
  Page,
  PerformanceResponse,
  ProgressResponse,
  ReportsResponse,
  UsageResponse,
  WebhookEventRow,
  WhatsappAccountView,
  auditQuery,
  businessProfileSchema,
  exportSchema,
  rangeQuery,
  usageQuery
} from '@smart-reply/shared';
import { Auth, Roles } from '../../common/decorators';
import type { CompanySession } from '../../common/session';
import { ZBody, ZQuery } from '../../common/validation';
import { ExportsService } from './exports.service';
import { InsightService } from './insight.service';
import { SetupService } from './setup.service';

/** Dashboards, reports and exports. */
@Controller()
export class InsightController {
  constructor(
    private readonly insight: InsightService,
    private readonly exportsSvc: ExportsService
  ) {}

  @Get('dashboard')
  @Roles('manager')
  dashboard(@Auth() s: CompanySession): Promise<DashboardResponse> {
    return this.insight.dashboard(s);
  }

  @Get('me/dashboard')
  myDashboard(@Auth() s: CompanySession): Promise<MyDashboardResponse> {
    return this.insight.myDashboard(s);
  }

  @Get('reports')
  @Roles('manager')
  reports(@Auth() s: CompanySession, @ZQuery(rangeQuery) q: z.infer<typeof rangeQuery>): Promise<ReportsResponse> {
    return this.insight.reports(s, q);
  }

  @Get('reports/progress')
  @Roles('manager')
  progress(@Auth() s: CompanySession, @ZQuery(rangeQuery) q: z.infer<typeof rangeQuery>): Promise<ProgressResponse> {
    return this.insight.progress(s, q);
  }

  @Get('me/performance')
  performance(@Auth() s: CompanySession, @ZQuery(rangeQuery) q: z.infer<typeof rangeQuery>): Promise<PerformanceResponse> {
    return this.insight.performance(s, q);
  }

  /** Staff may export only their own performance (checked in the service). */
  @Post('exports')
  @HttpCode(200)
  export(@Auth() s: CompanySession, @ZBody(exportSchema) body: z.infer<typeof exportSchema>): Promise<ExportResponse> {
    return this.exportsSvc.create(s, body);
  }
}

/** Billing, business profile, number, integrations and audit: managers only. */
@Controller()
@Roles('manager')
export class SetupController {
  constructor(private readonly svc: SetupService) {}

  @Get('billing/usage')
  usage(@Auth() s: CompanySession, @ZQuery(usageQuery) q: z.infer<typeof usageQuery>): Promise<UsageResponse> {
    return this.svc.usage(s, q.month);
  }

  @Get('billing/invoices')
  invoices(@Auth() s: CompanySession): Promise<Invoice[]> {
    return this.svc.invoices(s);
  }

  @Get('business-profile')
  profile(@Auth() s: CompanySession): Promise<BusinessProfile> {
    return this.svc.getProfile(s);
  }

  @Put('business-profile')
  saveProfile(@Auth() s: CompanySession, @ZBody(businessProfileSchema) body: z.infer<typeof businessProfileSchema>): Promise<BusinessProfile> {
    return this.svc.putProfile(s, body);
  }

  @Get('whatsapp/account')
  account(@Auth() s: CompanySession): Promise<WhatsappAccountView> {
    return this.svc.account(s);
  }

  @Post('whatsapp/account/refresh')
  @HttpCode(200)
  refresh(@Auth() s: CompanySession): Promise<WhatsappAccountView> {
    return this.svc.refreshAccount(s);
  }

  @Get('integrations/webhook')
  webhook(@Auth() s: CompanySession): Promise<IntegrationStatus> {
    return this.svc.webhookStatus(s);
  }

  @Get('integrations/events')
  events(@Auth() s: CompanySession): Promise<WebhookEventRow[]> {
    return this.svc.webhookEvents(s);
  }

  @Post('integrations/test')
  @HttpCode(200)
  test(@Auth() s: CompanySession): Promise<IntegrationTestResponse> {
    return this.svc.testWebhook(s);
  }

  @Get('audit')
  audit(@Auth() s: CompanySession, @ZQuery(auditQuery) q: z.infer<typeof auditQuery>): Promise<Page<AuditEntry>> {
    return this.svc.auditLog(s, q);
  }
}
