import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { PlatformGuard } from '../platform/platform.guard';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './user.dto';
import { UsersService } from './users.service';

@Controller('platform/companies/:companyId/users')
@UseGuards(AuthGuard, PlatformGuard)
export class PlatformUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Param('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.users.listForCompany(companyId, { page, pageSize, q });
  }

  @Post()
  create(@Param('companyId') companyId: string, @Body() body: CreateUserDto, @CurrentAuth() auth: RequestAuth) {
    return this.users.createForCompany(companyId, body, auth.userId);
  }

  @Get(':userId')
  get(@Param('companyId') companyId: string, @Param('userId') userId: string) {
    return this.users.getForCompany(companyId, userId);
  }

  @Patch(':userId')
  update(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @Body() body: UpdateUserDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.users.updateForCompany(companyId, userId, body, auth.userId);
  }

  @Post(':userId/password')
  @HttpCode(204)
  reset(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @Body() body: ResetPasswordDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.users.resetForCompany(companyId, userId, body.password, auth.userId);
  }
}
