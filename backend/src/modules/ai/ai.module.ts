import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiEngine } from './ai.engine';
import { AiService } from './ai.service';

@Module({ controllers: [AiController], providers: [AiEngine, AiService], exports: [AiEngine, AiService] })
export class AiModule {}
