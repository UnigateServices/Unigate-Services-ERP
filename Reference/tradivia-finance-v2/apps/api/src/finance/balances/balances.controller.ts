import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { BalancesService } from './balances.service';

@Controller('balances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  getFunds(@CurrentUser() user: AuthUser) {
    return this.balances.getFunds(user);
  }
}
