import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ListOutcomeQueryDto } from './dto/list-outcome.dto';
import { CreateOutcomeDto } from './dto/outcome.dto';
import { OutcomesService } from './outcomes.service';

@Controller('outcomes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class OutcomesController {
  constructor(private readonly outcomes: OutcomesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListOutcomeQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.outcomes.search(user, query) : this.outcomes.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOutcomeDto) {
    return this.outcomes.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateOutcomeDto,
    @Query('reason') reason?: string,
  ) {
    return this.outcomes.update(user, id, body, reason);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.outcomes.remove(user, id, reason);
  }
}
