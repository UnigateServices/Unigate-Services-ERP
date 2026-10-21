import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CurrencyActiveDto, SaveRateDto } from './dto/policy.dto';
import { PolicyService } from './policy.service';

@Controller('company-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get('currencies')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR)
  currencies() {
    return this.policy.currencies();
  }

  @Patch('currencies/:code')
  @Roles(Role.GENERAL_MANAGER)
  setActive(@Param('code') code: string, @Body() body: CurrencyActiveDto) {
    return this.policy.setActive(code, body.active);
  }

  @Get('rates')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  rates(@Query('date') date?: string) {
    return this.policy.rates(date || '');
  }

  @Put('rates')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  saveRate(@Body() body: SaveRateDto) {
    return this.policy.saveRate(body.code, body.date, body.rate);
  }

  @Get('rates/quote')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR)
  quote(@Query('code') code = '', @Query('date') date = '') {
    return this.policy.quote(code, date);
  }

  @Get('rates/history')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  rateHistory(@Query('code') code?: string) {
    return this.policy.rateHistory(code);
  }
}
