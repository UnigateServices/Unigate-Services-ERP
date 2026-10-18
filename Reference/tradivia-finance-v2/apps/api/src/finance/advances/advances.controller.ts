import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateAdvanceDto } from './dto/advance.dto';
import { ListAdvanceQueryDto } from './dto/list-advance.dto';
import { AdvancesService } from './advances.service';

@Controller('advances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class AdvancesController {
  constructor(private readonly advances: AdvancesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAdvanceQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.advances.search(user, query) : this.advances.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAdvanceDto) {
    return this.advances.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateAdvanceDto,
    @Query('reason') reason?: string,
  ) {
    return this.advances.update(user, id, body, reason);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.advances.remove(user, id, reason);
  }
}
