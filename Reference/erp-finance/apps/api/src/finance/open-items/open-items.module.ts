import { Module } from '@nestjs/common';
import { OpenItemsController } from './open-items.controller';
import { OpenItemsService } from './open-items.service';

@Module({
  controllers: [OpenItemsController],
  providers: [OpenItemsService],
})
export class OpenItemsModule {}
