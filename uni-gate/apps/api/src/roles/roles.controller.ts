import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.roles.listForSession(auth);
  }
}
