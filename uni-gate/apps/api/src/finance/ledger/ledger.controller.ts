import { Body, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { CreateAccountDto, JournalEntryDto, ReverseJournalDto, UpdateAccountDto } from './dto/journal.dto';
import { LedgerService } from './ledger.service';

@FinanceRoute('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('accounts')
  accounts(@CurrentAuth() auth: RequestAuth) {
    return this.ledger.listAccounts(financeActor(auth));
  }

  @Get('statement-lines')
  statementLines(@CurrentAuth() auth: RequestAuth) {
    financeActor(auth);
    return this.ledger.listStatementLines();
  }

  @Post('accounts')
  createAccount(@CurrentAuth() auth: RequestAuth, @Body() body: CreateAccountDto) {
    return this.ledger.createAccount(financeActor(auth, 'APPROVE'), body);
  }

  @Patch('accounts/:id')
  setAccount(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: UpdateAccountDto) {
    const actor = financeActor(auth, 'APPROVE');
    if (body.status && body.parentId === undefined && body.statementLine === undefined) {
      return this.ledger.updateAccount(actor, id, { status: body.status });
    }
    return this.ledger.updateAccount(actor, id, body);
  }

  @Get('cost-centers')
  costCenters(@CurrentAuth() auth: RequestAuth) {
    return this.ledger.listCostCenters(financeActor(auth));
  }

  @Get('entries')
  entries(@CurrentAuth() auth: RequestAuth) {
    return this.ledger.listEntries(financeActor(auth));
  }

  @Get('entries/source/:type/:id')
  source(@CurrentAuth() auth: RequestAuth, @Param('type') type: string, @Param('id') id: string) {
    return this.ledger.findBySource(financeActor(auth), type, id);
  }

  @Post('entries')
  createEntry(@CurrentAuth() auth: RequestAuth, @Body() body: JournalEntryDto) {
    return this.ledger.createEntry(financeActor(auth, 'APPROVE'), body);
  }

  @Patch('entries/:id')
  updateEntry(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: JournalEntryDto) {
    return this.ledger.updateEntry(financeActor(auth, 'APPROVE'), id, body);
  }

  @Post('entries/:id/post')
  postEntry(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.ledger.postEntry(financeActor(auth, 'APPROVE'), id);
  }

  @Post('entries/:id/reverse')
  reverseEntry(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: ReverseJournalDto) {
    return this.ledger.reverseEntry(financeActor(auth, 'APPROVE'), id, body.reason);
  }

  @Delete('entries/:id')
  removeDraft(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.ledger.removeDraft(financeActor(auth, 'APPROVE'), id);
  }
}
