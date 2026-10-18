import { Module } from '@nestjs/common';
import { OpeningBalancesController } from './opening-balances.controller';
import { OpeningBalancesService } from './opening-balances.service';

@Module({
  controllers: [OpeningBalancesController],
  providers: [OpeningBalancesService],
})
export class OpeningBalancesModule {}
