import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RulesService } from './rules.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController],
  providers: [TeamService, PresenceService, RulesService],
  exports: [TeamService, PresenceService]
})
export class TeamModule {}
