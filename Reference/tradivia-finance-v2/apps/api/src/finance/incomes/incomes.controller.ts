import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateIncomeDto } from './dto/income.dto';
import { ListIncomeQueryDto } from './dto/list-income.dto';
import { IncomesService } from './incomes.service';

@Controller('incomes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListIncomeQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.incomes.search(user, query) : this.incomes.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateIncomeDto) {
    return this.incomes.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateIncomeDto,
    @Query('reason') reason?: string,
  ) {
    return this.incomes.update(user, id, body, reason);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.incomes.remove(user, id, reason);
  }
}
