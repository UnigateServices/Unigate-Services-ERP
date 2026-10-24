import { Body, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestAuth } from '../../../auth/auth.service';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { financeActor } from '../../finance-access';
import { FinanceRoute } from '../../finance-route';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import { BanksService } from './banks.service';

@FinanceRoute('banks')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.banks.list(financeActor(auth));
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateNamedRecordDto) {
    return this.banks.create(financeActor(auth, 'APPROVE'), body);
  }

  @Patch(':id')
  update(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: UpdateNamedRecordDto) {
    return this.banks.update(financeActor(auth, 'APPROVE'), id, body);
  }

  @Delete(':id')
  remove(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.banks.remove(financeActor(auth, 'APPROVE'), id);
  }
}
