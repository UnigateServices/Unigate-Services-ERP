import { Body, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestAuth } from '../../../auth/auth.service';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { financeActor } from '../../finance-access';
import { FinanceRoute } from '../../finance-route';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import { BorrowersService } from './borrowers.service';

@FinanceRoute('borrowers')
export class BorrowersController {
  constructor(private readonly borrowers: BorrowersService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.borrowers.list(financeActor(auth));
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateNamedRecordDto) {
    return this.borrowers.create(financeActor(auth, 'APPROVE'), body);
  }

  @Patch(':id')
  update(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: UpdateNamedRecordDto) {
    return this.borrowers.update(financeActor(auth, 'APPROVE'), id, body);
  }

  @Delete(':id')
  remove(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.borrowers.remove(financeActor(auth, 'APPROVE'), id);
  }
}
