import { Module } from '@nestjs/common';
import { OpeningEntryController } from './opening-entry.controller';
import { OpeningEntryService } from './opening-entry.service';

@Module({
  controllers: [OpeningEntryController],
  providers: [OpeningEntryService],
})
export class OpeningEntryModule {}
