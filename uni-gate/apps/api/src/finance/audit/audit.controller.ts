import { Body, Get, Param, Post, Query } from '@nestjs/common';
import { AuditRequestStatus } from '@prisma/client';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { CreateAuditRequestDto } from './dto/create-audit-request.dto';
import { DecideAuditRequestDto } from './dto/decide-audit-request.dto';
import { AuditService } from './audit.service';

@FinanceRoute('audit/requests')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('history')
  history(@CurrentAuth() auth: RequestAuth) {
    return this.audit.history(financeActor(auth));
  }

  @Get()
  list(@CurrentAuth() auth: RequestAuth, @Query('status') status?: AuditRequestStatus) {
    const allowed = Object.values(AuditRequestStatus) as string[];
    const filter = status && allowed.includes(status) ? status : AuditRequestStatus.PENDING;
    return this.audit.list(financeActor(auth), filter);
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateAuditRequestDto) {
    return this.audit.createRequest(financeActor(auth, 'WRITE'), body);
  }

  @Post(':id/decide')
  decide(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: DecideAuditRequestDto) {
    return this.audit.decide(financeActor(auth, 'APPROVE'), id, body.decision);
  }
}
