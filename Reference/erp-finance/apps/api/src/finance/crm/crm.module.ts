import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [SalesModule],
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
