import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { AutomationCoreModule } from '../core/automation.service';
import { AiModule } from '../modules/ai/ai.module';
import { CallsModule } from '../modules/calls/calls.module';
import { ContentModule } from '../modules/content/content.module';
import { MaintenanceService } from './maintenance.service';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [CoreModule, AutomationCoreModule, ContentModule, CallsModule, AiModule],
  providers: [WebhookProcessor, MaintenanceService]
})
export class WorkerModule {}
