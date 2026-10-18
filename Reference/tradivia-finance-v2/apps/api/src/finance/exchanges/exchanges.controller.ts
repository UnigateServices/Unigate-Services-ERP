import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateExchangeDto } from './dto/exchange.dto';
import { ListExchangeQueryDto } from './dto/list-exchange.dto';
import { ExchangesService } from './exchanges.service';

@Controller('exchanges')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListExchangeQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.exchanges.search(user, query) : this.exchanges.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateExchangeDto) {
    return this.exchanges.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateExchangeDto,
    @Query('reason') reason?: string,
  ) {
    return this.exchanges.update(user, id, body, reason);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.exchanges.remove(user, id, reason);
  }
}
