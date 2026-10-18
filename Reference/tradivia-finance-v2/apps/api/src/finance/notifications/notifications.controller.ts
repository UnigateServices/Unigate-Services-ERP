import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.notifications.counts(user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('section') section?: string) {
    return this.notifications.list(user, section);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.remove(user, id);
  }
}
