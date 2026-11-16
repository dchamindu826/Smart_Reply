import { Module } from '@nestjs/common';
import { ContactsController, LabelsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { LabelsService } from './labels.service';

@Module({
  controllers: [ContactsController, LabelsController],
  providers: [ContactsService, LabelsService],
  exports: [ContactsService]
})
export class ContactsModule {}
