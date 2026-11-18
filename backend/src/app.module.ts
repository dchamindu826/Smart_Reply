import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard';
import { ErrorFilter } from './common/errors';
import { CoreModule } from './core/core.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { CallsModule } from './modules/calls/calls.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ContentModule } from './modules/content/content.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { InsightModule } from './modules/insight/insight.module';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import { TeamModule } from './modules/team/team.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    CoreModule,
    HealthModule,
    AuthModule,
    FilesModule,
    WebhooksModule,
    ConversationsModule,
    ContactsModule,
    TeamModule,
    ContentModule,
    CallsModule,
    BookingsModule,
    AiModule,
    InsightModule,
    AdminModule
  ],
  providers: [{ provide: APP_GUARD, useExisting: AuthGuard }, { provide: APP_FILTER, useClass: ErrorFilter }, RealtimeGateway]
})
export class AppModule {}
