import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ExportsService } from './exports.service';
import { InsightController, SetupController } from './insight.controller';
import { InsightService } from './insight.service';
import { MetricsService } from './metrics.service';
import { SetupService } from './setup.service';

/** Dashboards, reports, exports, billing, business profile, number view, integrations and audit. */
@Module({
  imports: [WebhooksModule],
  controllers: [InsightController, SetupController],
  providers: [MetricsService, InsightService, ExportsService, SetupService],
  exports: [MetricsService, InsightService]
})
export class InsightModule {}
