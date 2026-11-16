import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../common/audit';
import { AuthGuard } from '../common/auth.guard';
import { SessionLoader } from '../common/session-loader';
import { DbModule } from '../infra/db';
import { MailerModule } from '../infra/mailer';
import { QueuesModule } from '../infra/queues';
import { RateLimitModule } from '../infra/rate-limit';
import { RealtimeModule } from '../infra/realtime';
import { StorageModule } from '../infra/storage';
import { MetaModule } from '../meta/platform';
import { FilesCoreModule } from './files.service';
import { InboxCoreModule } from './inbox.service';
import { MessagingCoreModule } from './messaging.service';
import { PushCoreModule } from './push.service';

/** Services shared by the API and the workers. */
@Global()
@Module({
  imports: [
    DbModule,
    QueuesModule,
    RealtimeModule,
    StorageModule,
    MailerModule,
    RateLimitModule,
    AuditModule,
    MetaModule,
    FilesCoreModule,
    InboxCoreModule,
    MessagingCoreModule,
    PushCoreModule
  ],
  providers: [SessionLoader, AuthGuard],
  exports: [SessionLoader, AuthGuard]
})
export class CoreModule {}
