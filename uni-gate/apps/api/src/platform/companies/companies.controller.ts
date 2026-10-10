import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { RequestAuth } from '../../auth/auth.service';
import { PlatformGuard } from '../platform.guard';
import { ActivateCompanyDto, CreateCompanyDto, ListCompaniesQuery, UpdateCompanyDto } from './company.dto';
import { CompaniesService } from './companies.service';

@Controller('platform/companies')
@UseGuards(AuthGuard, PlatformGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@Query() query: ListCompaniesQuery) {
    return this.companies.list(query);
  }

  @Post()
  create(@Body() body: CreateCompanyDto, @CurrentAuth() auth: RequestAuth) {
    return this.companies.create(body, auth.userId);
  }

  @Get(':companyId')
  get(@Param('companyId') companyId: string) {
    return this.companies.get(companyId);
  }

  @Patch(':companyId')
  update(@Param('companyId') companyId: string, @Body() body: UpdateCompanyDto, @CurrentAuth() auth: RequestAuth) {
    return this.companies.update(companyId, body, auth.userId);
  }

  @Post(':companyId/suspend')
  suspend(@Param('companyId') companyId: string, @CurrentAuth() auth: RequestAuth) {
    return this.companies.suspend(companyId, auth.userId);
  }

  @Post(':companyId/activate')
  activate(
    @Param('companyId') companyId: string,
    @Body() body: ActivateCompanyDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.companies.activate(companyId, body.expiresOn, auth.userId);
  }
}
