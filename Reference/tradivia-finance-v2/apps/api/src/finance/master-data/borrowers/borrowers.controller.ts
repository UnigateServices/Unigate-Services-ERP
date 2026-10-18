import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import { BorrowersService } from './borrowers.service';

@Controller('borrowers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BorrowersController {
  constructor(private readonly borrowers: BorrowersService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
  list(@CurrentUser() user: AuthUser) {
    return this.borrowers.list(user);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  create(@Body() body: CreateNamedRecordDto) {
    return this.borrowers.create(body);
  }

  @Patch(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  update(@Param('id') id: string, @Body() body: UpdateNamedRecordDto) {
    return this.borrowers.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.borrowers.remove(id);
  }
}
