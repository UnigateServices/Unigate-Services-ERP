import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { RunReportDto } from './dto/run-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('catalog')
  catalog(@CurrentUser() user: AuthUser) {
    return this.reports.catalog(user);
  }

  @Post('run')
  run(@CurrentUser() user: AuthUser, @Body() dto: RunReportDto) {
    return this.reports.run(user, dto);
  }
}
