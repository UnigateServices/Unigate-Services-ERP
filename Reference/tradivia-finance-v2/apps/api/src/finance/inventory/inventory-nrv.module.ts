import { Module } from '@nestjs/common';
import { InventoryNrvController } from './inventory-nrv.controller';
import { InventoryNrvService } from './inventory-nrv.service';

@Module({
  controllers: [InventoryNrvController],
  providers: [InventoryNrvService],
  exports: [InventoryNrvService],
})
export class InventoryNrvModule {}
