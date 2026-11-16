import { Module } from '@nestjs/common';
import { BroadcastRunner } from './broadcast.runner';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';
import { TemplateSync } from './template-sync';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

/** Templates, quick replies, catalog, media gallery, broadcasts and automated flows. */
@Module({
  controllers: [TemplatesController, QuickRepliesController, CatalogController, MediaController, BroadcastsController, FlowsController],
  providers: [TemplateSync, BroadcastRunner, TemplatesService, QuickRepliesService, CatalogService, MediaService, BroadcastsService, FlowsService],
  exports: [TemplateSync, BroadcastRunner]
})
export class ContentModule {}
