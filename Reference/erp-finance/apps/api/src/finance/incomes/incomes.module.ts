import { Module } from '@nestjs/common';
import { IncomesController } from './incomes.controller';
import { IncomesService } from './incomes.service';

@Module({
  controllers: [IncomesController],
  providers: [IncomesService],
})
export class IncomesModule {}
