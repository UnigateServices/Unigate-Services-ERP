import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateOpeningBalanceDto } from './dto/opening-balance.dto';
import { ListOpeningQueryDto } from './dto/list-opening.dto';
import { OpeningBalancesService } from './opening-balances.service';

@Controller('opening-balances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpeningBalancesController {
  constructor(private readonly openings: OpeningBalancesService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  list(@CurrentUser() user: AuthUser, @Query() query: ListOpeningQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.openings.search(user, query) : this.openings.list(user);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOpeningBalanceDto) {
    return this.openings.create(user, body);
  }

  @Delete(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.openings.remove(user, id);
  }
}
