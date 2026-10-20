import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessLogController } from './audit/access-log.controller';
import { AccessLogService } from './audit/access-log.service';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesService } from './companies/companies.service';
import { PlatformGuard } from './platform.guard';

@Module({
  imports: [AuthModule],
  controllers: [CompaniesController, AccessLogController],
  providers: [CompaniesService, AccessLogService, PlatformGuard],
})
export class PlatformModule {}
