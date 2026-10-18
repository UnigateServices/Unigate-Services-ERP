import { Module } from '@nestjs/common';
import { BalancesModule } from '../balances/balances.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [BalancesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
