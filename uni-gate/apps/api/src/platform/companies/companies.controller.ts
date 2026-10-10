import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { CookieService } from '../../auth/cookie.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import type { RequestAuth } from '../../auth/auth.service';
import { PlatformGuard } from '../platform.guard';
import { ActivateCompanyDto, CreateCompanyDto, ListCompaniesQuery, UpdateCompanyDto } from './company.dto';
import { CompaniesService } from './companies.service';

@Controller('platform/companies')
@UseGuards(AuthGuard, PlatformGuard)
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly cookies: CookieService,
  ) {}

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

  @Post(':companyId/enter')
  @HttpCode(200)
  async enter(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: RequestAuth,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.companies.enter(companyId, auth);
    this.cookies.attach(response, issued.token, issued.expiresAt);
    return { ok: true };
  }

  @Post(':companyId/leave')
  @HttpCode(200)
  async leave(
    @Param('companyId') companyId: string,
    @CurrentAuth() auth: RequestAuth,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.companies.leave(companyId, auth);
    this.cookies.attach(response, issued.token, issued.expiresAt);
    return { ok: true };
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
