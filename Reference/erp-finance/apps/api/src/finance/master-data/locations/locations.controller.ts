import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  list(@CurrentUser() user: AuthUser) {
    return this.locations.list(user);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER)
  create(@Body() body: CreateNamedRecordDto) {
    return this.locations.create(body);
  }

  @Patch(':id')
  @Roles(Role.GENERAL_MANAGER)
  update(@Param('id') id: string, @Body() body: UpdateNamedRecordDto) {
    return this.locations.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.GENERAL_MANAGER)
  remove(@Param('id') id: string) {
    return this.locations.remove(id);
  }
}
