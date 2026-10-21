import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { MonitorQueryDto } from './dto/monitor-query.dto';
import { MonitorService } from './monitor.service';

@Controller('monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  list(@CurrentUser() user: AuthUser, @Query() query: MonitorQueryDto) {
    return this.monitor.list(user, query);
  }
}
