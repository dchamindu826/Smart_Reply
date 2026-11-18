import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { AiModule } from '../modules/ai/ai.module';
import { CallsModule } from '../modules/calls/calls.module';
import { VoiceAgent } from './agent.service';

/** The voice process: the AI voice agent and what it needs (no HTTP controllers are served). */
@Module({
  imports: [CoreModule, CallsModule, AiModule],
  providers: [VoiceAgent]
})
export class VoiceProcessModule {}
