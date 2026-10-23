import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { RoleBodyDto } from './role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.roles.listForSession(auth);
  }

  /** Company comes only from the session. Needs roles WRITE and all-branch scope (decision L). */
  @Post()
  create(@Body() body: RoleBodyDto, @CurrentAuth() auth: RequestAuth) {
    return this.roles.createForSession(auth, body);
  }

  @Patch(':roleId')
  update(@Param('roleId') roleId: string, @Body() body: RoleBodyDto, @CurrentAuth() auth: RequestAuth) {
    return this.roles.updateForSession(auth, roleId, body);
  }
}
