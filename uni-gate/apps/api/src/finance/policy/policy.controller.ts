import { Body, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { RequestAuth } from '../../auth/auth.service';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { CurrencyActiveDto, SaveRateDto } from './dto/policy.dto';
import { PolicyService } from './policy.service';

@FinanceRoute('company-policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get('currencies')
  currencies(@CurrentAuth() auth: RequestAuth) {
    return this.policy.currencies(financeActor(auth));
  }

  @Patch('currencies/:code')
  setActive(@CurrentAuth() auth: RequestAuth, @Param('code') code: string, @Body() body: CurrencyActiveDto) {
    return this.policy.setActive(financeActor(auth, 'ADMIN'), code, body.active);
  }

  @Get('rates')
  rates(@CurrentAuth() auth: RequestAuth, @Query('date') date?: string) {
    return this.policy.rates(financeActor(auth), date || '');
  }

  @Put('rates')
  saveRate(@CurrentAuth() auth: RequestAuth, @Body() body: SaveRateDto) {
    return this.policy.saveRate(financeActor(auth, 'APPROVE'), body.code, body.date, body.rate);
  }

  @Get('rates/quote')
  quote(@CurrentAuth() auth: RequestAuth, @Query('code') code = '', @Query('date') date = '') {
    return this.policy.quote(financeActor(auth), code, date);
  }

  @Get('rates/history')
  rateHistory(@CurrentAuth() auth: RequestAuth, @Query('code') code?: string) {
    return this.policy.rateHistory(financeActor(auth), code);
  }
}
