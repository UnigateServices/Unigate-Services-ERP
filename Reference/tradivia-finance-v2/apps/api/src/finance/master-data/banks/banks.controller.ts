import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import { BanksService } from './banks.service';

@Controller('banks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
  list(@CurrentUser() user: AuthUser) {
    return this.banks.list(user);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  create(@Body() body: CreateNamedRecordDto) {
    return this.banks.create(body);
  }

  @Patch(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  update(@Param('id') id: string, @Body() body: UpdateNamedRecordDto) {
    return this.banks.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.banks.remove(id);
  }
}
