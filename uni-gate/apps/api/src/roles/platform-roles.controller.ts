import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { PlatformGuard } from '../platform/platform.guard';
import { RoleBodyDto } from './role.dto';
import { RolesService } from './roles.service';

@Controller('platform/companies/:companyId/roles')
@UseGuards(AuthGuard, PlatformGuard)
export class PlatformRolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.roles.listForCompany(companyId);
  }

  @Post()
  create(@Param('companyId') companyId: string, @Body() body: RoleBodyDto, @CurrentAuth() auth: RequestAuth) {
    return this.roles.create(companyId, body, auth.userId);
  }

  @Patch(':roleId')
  update(
    @Param('companyId') companyId: string,
    @Param('roleId') roleId: string,
    @Body() body: RoleBodyDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.roles.update(companyId, roleId, body, auth.userId);
  }
}
