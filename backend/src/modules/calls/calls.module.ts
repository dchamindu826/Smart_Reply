import { Module } from '@nestjs/common';
import { CallSettingsService } from './call-settings.service';
import { CallSettingsController, CallsController, ScheduledCallsController } from './calls.controller';
import { CallsCore } from './calls.core';
import { CallsEngine } from './calls.engine';
import { CallsService } from './calls.service';
import { VoicePolicy } from '../../voice/voice-policy';

@Module({
  controllers: [CallsController, ScheduledCallsController, CallSettingsController],
  providers: [CallsCore, CallsEngine, CallsService, CallSettingsService, VoicePolicy],
  exports: [CallsEngine, CallsCore, VoicePolicy]
})
export class CallsModule {}
