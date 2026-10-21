import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';
import { RateService } from './rate.service';

@Module({
  controllers: [PolicyController],
  providers: [PolicyService, RateService],
  exports: [PolicyService, RateService],
})
export class PolicyModule {}
