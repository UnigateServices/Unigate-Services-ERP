import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ListTransferQueryDto } from './dto/list-transfer.dto';
import { CreateTransferDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTransferQueryDto) {
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.transfers.search(user, query) : this.transfers.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTransferDto) {
    return this.transfers.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateTransferDto,
    @Query('reason') reason?: string,
  ) {
    return this.transfers.update(user, id, body, reason);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('reason') reason?: string) {
    return this.transfers.remove(user, id, reason);
  }
}
