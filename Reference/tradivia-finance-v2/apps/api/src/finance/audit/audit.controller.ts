import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuditRequestStatus, Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateAuditRequestDto } from './dto/create-audit-request.dto';
import { DecideAuditRequestDto } from './dto/decide-audit-request.dto';
import { AuditService } from './audit.service';

@Controller('audit/requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('history')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  history(@CurrentUser() user: AuthUser) {
    return this.audit.history(user);
  }

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
  list(@CurrentUser() user: AuthUser, @Query('status') status?: AuditRequestStatus) {
    const allowed = Object.values(AuditRequestStatus) as string[];
    const filter = status && allowed.includes(status) ? status : AuditRequestStatus.PENDING;
    return this.audit.list(user, filter);
  }

  @Post()
  @Roles(Role.EMPLOYEE)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAuditRequestDto) {
    return this.audit.createRequest(user, body);
  }

  @Post(':id/decide')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DecideAuditRequestDto,
  ) {
    return this.audit.decide(user, id, body.decision);
  }
}
