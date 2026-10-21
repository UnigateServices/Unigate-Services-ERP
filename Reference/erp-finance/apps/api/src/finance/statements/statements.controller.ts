import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { BudgetStatusDto, FunctionalCurrencyDto, InventoryMethodDto, RevaluationDto, SaveBudgetDto, StatementQueryDto } from './dto/statement.dto';
import { StatementsService } from './statements.service';

@Controller('statements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get('policy')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  policy() {
    return this.statements.policy();
  }

  @Patch('policy')
  @Roles(Role.GENERAL_MANAGER)
  setPolicy(@Body() body: FunctionalCurrencyDto) {
    return this.statements.setFunctionalCurrency(body.functionalCurrency);
  }

  @Patch('policy/inventory')
  @Roles(Role.GENERAL_MANAGER)
  setInventory(@Body() body: InventoryMethodDto) {
    return this.statements.setInventoryMethod(body.inventoryMethod);
  }

  @Get('fx-revaluation')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  previewRevaluation(@Query() query: RevaluationDto) {
    return this.statements.previewRevaluation(query.asOf, query.rate);
  }

  @Post('fx-revaluation')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  revalue(@CurrentUser() user: AuthUser, @Body() body: RevaluationDto) {
    return this.statements.revalue(user.id, body.asOf, body.rate);
  }

  @Post('fx-revaluation/:asOf/reverse')
  @Roles(Role.GENERAL_MANAGER)
  reverseRevaluation(@CurrentUser() user: AuthUser, @Param('asOf') asOf: string) {
    return this.statements.reverseRevaluation(user.id, asOf);
  }

  @Get('trial-balance')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  trialBalance(@Query() query: StatementQueryDto) {
    return this.statements.trialBalance(query.asOf || today(), query.currency, query.costCenterId, query.rate);
  }

  @Get('profit-loss')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  profitAndLoss(@Query() query: StatementQueryDto) {
    const to = query.to || today();
    const from = query.from || `${to.slice(0, 4)}-01-01`;
    return this.statements.profitAndLoss(from, to, query.currency, query.costCenterId, query.rate);
  }

  @Get('balance-sheet')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  balanceSheet(@Query() query: StatementQueryDto) {
    return this.statements.balanceSheet(query.asOf || today(), query.currency, query.costCenterId, query.rate);
  }

  @Get('cash-flow')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  cashFlow(@Query() query: StatementQueryDto) {
    const to = query.to || today();
    const from = query.from || `${to.slice(0, 4)}-01-01`;
    return this.statements.cashFlow(from, to, query.currency, query.costCenterId, query.rate);
  }

  @Get('equity')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  equity(@Query() query: StatementQueryDto) {
    const to = query.to || today();
    const from = query.from || `${to.slice(0, 4)}-01-01`;
    return this.statements.equityChanges(from, to, query.currency, query.costCenterId, query.rate);
  }

  @Post('years/:year/close')
  @Roles(Role.GENERAL_MANAGER)
  closeYear(@CurrentUser() user: AuthUser, @Param('year') year: string) {
    return this.statements.closeYear(user.id, Number(year));
  }

  @Post('years/:year/reopen')
  @Roles(Role.GENERAL_MANAGER)
  reopenYear(@CurrentUser() user: AuthUser, @Param('year') year: string) {
    return this.statements.reopenYear(user.id, Number(year));
  }

  @Get('periods')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  periods(@Query('year') year?: string) {
    const parsed = Number(year);
    return this.statements.periods(Number.isInteger(parsed) && parsed > 2000 ? parsed : new Date().getFullYear());
  }

  @Post('periods/:id/close')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  closePeriod(@Param('id') id: string) {
    return this.statements.closePeriod(id);
  }

  @Post('periods/:id/reopen')
  @Roles(Role.GENERAL_MANAGER)
  reopenPeriod(@Param('id') id: string) {
    return this.statements.reopenPeriod(id);
  }

  @Get('budgets')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  budgets() {
    return this.statements.listBudgets();
  }

  @Post('budgets')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  saveBudget(@Body() body: SaveBudgetDto) {
    return this.statements.saveBudget(body);
  }

  @Patch('budgets/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  setBudgetStatus(@Param('id') id: string, @Body() body: BudgetStatusDto) {
    return this.statements.setBudgetStatus(id, body);
  }

  @Delete('budgets/:id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  removeBudget(@Param('id') id: string) {
    return this.statements.removeBudget(id);
  }

  @Get('budgets/:id/variance')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  variance(@Param('id') id: string, @Query() query: StatementQueryDto) {
    const to = query.to || today();
    const from = query.from || `${to.slice(0, 4)}-01-01`;
    return this.statements.variance(id, from, to, query.costCenterId);
  }
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
