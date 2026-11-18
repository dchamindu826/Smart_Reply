import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminAudit } from './admin.audit';
import { AdminAiController, AdminVoiceController, AdminCompaniesController, AdminOpsController, AdminPlatformController, AdminWhatsappController } from './admin.controller';
import { AiAdminService } from './ai-admin.service';
import { CompaniesService } from './companies.service';
import { ConnectLinksController } from './connect-links.controller';
import { OpsService } from './ops.service';
import { PlatformAdminService } from './platform.service';
import { WhatsappConnectService } from './whatsapp-connect.service';
import { VoiceAdminService } from './voice-admin.service';

@Module({
  imports: [AuthModule, WebhooksModule, AiModule],
  controllers: [AdminCompaniesController, AdminPlatformController, AdminWhatsappController, AdminAiController, AdminOpsController, AdminVoiceController, ConnectLinksController],
  providers: [AdminAudit, CompaniesService, PlatformAdminService, WhatsappConnectService, AiAdminService, OpsService, VoiceAdminService]
})
export class AdminModule {}
