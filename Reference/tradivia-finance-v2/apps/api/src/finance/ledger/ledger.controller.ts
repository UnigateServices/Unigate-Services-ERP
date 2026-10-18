import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CreateAccountDto, JournalEntryDto, UpdateAccountDto } from './dto/journal.dto';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('accounts')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  accounts() {
    return this.ledger.listAccounts();
  }

  @Get('statement-lines')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  statementLines() {
    return this.ledger.listStatementLines();
  }

  @Post('accounts')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  createAccount(@Body() body: CreateAccountDto) {
    return this.ledger.createAccount(body);
  }

  @Patch('accounts/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  setAccount(@Param('id') id: string, @Body() body: UpdateAccountDto) {
    if (body.status && body.parentId === undefined && body.statementLine === undefined) {
      return this.ledger.updateAccount(id, { status: body.status });
    }
    return this.ledger.updateAccount(id, body);
  }

  @Get('cost-centers')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR, Role.EMPLOYEE)
  costCenters() {
    return this.ledger.listCostCenters();
  }

  @Get('entries')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  entries() {
    return this.ledger.listEntries();
  }

  @Post('entries')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  createEntry(@CurrentUser() user: AuthUser, @Body() body: JournalEntryDto) {
    return this.ledger.createEntry(user, body);
  }

  @Patch('entries/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  updateEntry(@Param('id') id: string, @Body() body: JournalEntryDto) {
    return this.ledger.updateEntry(id, body);
  }

  @Post('entries/:id/post')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  postEntry(@Param('id') id: string) {
    return this.ledger.postEntry(id);
  }

  @Post('entries/:id/reverse')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  reverseEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ledger.reverseEntry(user, id);
  }

  @Delete('entries/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  removeDraft(@Param('id') id: string) {
    return this.ledger.removeDraft(id);
  }
}
