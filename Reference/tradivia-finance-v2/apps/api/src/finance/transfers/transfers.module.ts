import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
