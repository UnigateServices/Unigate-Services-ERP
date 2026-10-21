import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountType,
  BudgetStatus,
  Currency,
  JournalStatus,
  PeriodStatus,
  Prisma,
  RecordStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SYSTEM_CHART } from '../ledger/chart';
import { centerLineFilter } from '../ledger/cost-centers';
import { monthBounds } from '../ledger/fiscal-period';
import { replayCurrencyPosition, revaluePosition } from '../ledger/fx-journal';
import { postOperationJournal, reverseOperationJournal } from '../ledger/post-source';
import { BudgetStatusDto, SaveBudgetDto } from './dto/statement.dto';
import { buildIndirectCashFlow, cashFlowClass, cashFlowKey } from './cash-flow';
import { STATEMENT_LINES, statementLineOf } from './statement-lines';
import { monetaryRateGap, translatedLine } from './functional-view';

const SCALE = 10000;

type Bucket = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  line: string;
  currency: Currency;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async policy() {
    const row = await this.ensurePolicy();
    return {
      functionalCurrency: row.functionalCurrency,
      inventoryMethod: row.inventoryMethod === 'PERIODIC' ? 'PERIODIC' : 'PERPETUAL',
      functionalLocked: row.functionalLocked,
      openingLocked: row.openingLocked,
      inventoryLocked: row.inventoryLocked,
    };
  }

  async setFunctionalCurrency(currency: Currency) {
    const current = await this.ensurePolicy();
    if (current.functionalCurrency === currency) return this.policy();
    if (current.functionalLocked || current.openingLocked) throw new BadRequestException('FUNCTIONAL_CURRENCY_LOCKED');
    const liveExchange = await this.prisma.journalEntry.findFirst({
      where: {
        companyId: this.companyId,
        status: JournalStatus.POSTED,
        sourceType: 'EXCHANGE',
        sourceKey: { not: null },
      },
      select: { id: true },
    });
    if (liveExchange) throw new BadRequestException('FUNCTIONAL_CURRENCY_LOCKED');
    await this.prisma.accountingPolicy.update({
      where: { companyId: this.companyId },
      data: { functionalCurrency: currency },
    });
    return this.policy();
  }

  async setInventoryMethod(method: string) {
    const normalized = method === 'PERIODIC' ? 'PERIODIC' : method === 'PERPETUAL' || method === 'WAC' ? 'PERPETUAL' : '';
    if (!normalized) throw new BadRequestException('INVENTORY_METHOD');
    const current = await this.ensurePolicy();
    if (current.inventoryLocked) throw new BadRequestException('INVENTORY_LOCKED');
    await this.prisma.accountingPolicy.update({
      where: { companyId: this.companyId },
      data: { inventoryMethod: normalized === 'PERPETUAL' ? 'WAC' : 'PERIODIC' },
    });
    return this.policy();
  }

  async previewRevaluation(asOf: string, rate: number) {
    const parsed = this.revaluationInput(asOf, rate);
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.quoteRevaluation(tx, parsed.asOf, parsed.rate);
      return presentRevaluation(quote);
    });
  }

  async revalue(actorId: string, asOf: string, rate: number) {
    const parsed = this.revaluationInput(asOf, rate);
    const existing = await this.prisma.fxRevaluation.findUnique({
      where: { companyId_asOf: { companyId: this.companyId, asOf: parsed.asOf } },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('ALREADY_REVALUED');
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.quoteRevaluation(tx, parsed.asOf, parsed.rate);
      if (!quote.lines.length) throw new BadRequestException('NOTHING_TO_REVALUE');
      const row = await tx.fxRevaluation.create({
        data: {
          companyId: this.companyId,
          asOf: parsed.asOf,
          rate: parsed.rate,
          functional: quote.functional,
          foreignQty: quote.qty,
          carrying: quote.carrying,
          closingValue: quote.closing,
          gain: quote.gain,
        },
      });
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId,
        transactionDate: parsed.asOf,
        description: `إعادة تقييم عملة أجنبية ${parsed.asOf.toISOString().slice(0, 10)} بسعر ${parsed.rate}`,
        sourceType: 'FX_REVAL',
        sourceId: row.id,
        lines: quote.lines,
      });
      return presentRevaluation(quote);
    });
  }

  async reverseRevaluation(actorId: string, asOf: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new BadRequestException('BAD_PAYLOAD');
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.fxRevaluation.findUnique({
        where: { companyId_asOf: { companyId: this.companyId, asOf: new Date(`${asOf}T12:00:00.000Z`) } },
      });
      if (!row) throw new NotFoundException('REVALUATION_NOT_FOUND');
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId,
        sourceType: 'FX_REVAL',
        sourceId: row.id,
      });
      await tx.fxRevaluation.delete({ where: { id: row.id } });
    });
    return { asOf };
  }

  async periods(year = new Date().getFullYear()) {
    await this.ensureYear(year);
    const rows = await this.prisma.fiscalPeriod.findMany({
      where: { companyId: this.companyId, year },
      orderBy: { month: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      year: row.year,
      month: row.month,
      startsOn: isoDate(row.startsOn),
      endsOn: isoDate(row.endsOn),
      status: row.status,
      closedAt: row.closedAt?.toISOString() ?? null,
    }));
  }

  async closePeriod(id: string) {
    return this.setPeriod(id, PeriodStatus.CLOSED);
  }

  async reopenPeriod(id: string) {
    return this.setPeriod(id, PeriodStatus.OPEN);
  }

  async trialBalance(asOf: string, currency?: string, costCenterId?: string, rate?: number) {
    const view = await this.fxView(currency, rate);
    const buckets = await this.aggregate(undefined, asOf, bookCurrency(currency), costCenterId, view);
    const codes = view ? [view.functional] : bookCurrency(currency) ? [bookCurrency(currency)!] : [Currency.USD, Currency.SYP];
    return { asOf, books: codes.map((code) => this.trialBook(code, buckets)) };
  }

  async profitAndLoss(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
    const view = await this.fxView(currency, rate);
    const buckets = await this.aggregate(from, to, bookCurrency(currency), costCenterId, view, true);
    const codes = view ? [view.functional] : bookCurrency(currency) ? [bookCurrency(currency)!] : [Currency.USD, Currency.SYP];
    return { from, to, books: codes.map((code) => this.pnlBook(code, buckets)) };
  }

  async balanceSheet(asOf: string, currency?: string, costCenterId?: string, rate?: number) {
    const view = await this.fxView(currency, rate);
    const buckets = await this.aggregate(undefined, asOf, bookCurrency(currency), costCenterId, view);
    const codes = view ? [view.functional] : bookCurrency(currency) ? [bookCurrency(currency)!] : [Currency.USD, Currency.SYP];
    return { asOf, books: codes.map((code) => this.balanceBook(code, buckets)) };
  }

  async cashFlow(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
    const view = await this.fxView(currency, rate);
    const books = await this.cashBooks(from, to, currency, costCenterId, view);
    return { from, to, method: 'INDIRECT' as const, books };
  }

  async equityChanges(from: string, to: string, currency?: string, costCenterId?: string, rate?: number) {
    const view = await this.fxView(currency, rate);
    const prior = dayBefore(from);
    const opening = await this.aggregate(undefined, prior, bookCurrency(currency), costCenterId, view);
    const period = await this.aggregate(from, to, bookCurrency(currency), costCenterId, view, true);
    const codes = view ? [view.functional] : bookCurrency(currency) ? [bookCurrency(currency)!] : [Currency.USD, Currency.SYP];
    return { from, to, books: codes.map((code) => this.equityBook(code, opening, period)) };
  }

  async closeYear(actorId: string, year: number) {
    if (!Number.isInteger(year) || year < 2000) throw new BadRequestException('BAD_PAYLOAD');
    await this.ensureYear(year);
    const sourceId = String(year);
    const existing = await this.prisma.journalEntry.findUnique({
      where: { sourceKey: `YEAR_CLOSE:${sourceId}` },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('YEAR_CLOSED');
    const rows = await this.prisma.journalLine.findMany({
      where: {
        entry: {
          companyId: this.companyId,
          status: JournalStatus.POSTED,
          transactionDate: {
            gte: new Date(`${year}-01-01T12:00:00.000Z`),
            lte: new Date(`${year}-12-31T12:00:00.000Z`),
          },
        },
      },
      select: {
        currency: true,
        debit: true,
        credit: true,
        fxRate: true,
        account: { select: { code: true, type: true } },
      },
    });
    const lines = closingLines(
      rows.map((row) => ({
        code: row.account.code,
        type: row.account.type,
        currency: row.currency,
        debit: row.debit,
        credit: row.credit,
        fxRate: row.fxRate,
      })),
    );
    if (!lines.length) throw new BadRequestException('NOTHING_TO_CLOSE');
    await this.prisma.$transaction(async (tx) => {
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId,
        transactionDate: new Date(`${year}-12-31T12:00:00.000Z`),
        description: `إقفال نتائج ${year}`,
        sourceType: 'YEAR_CLOSE',
        sourceId,
        lines,
      });
      await tx.fiscalPeriod.updateMany({
        where: { companyId: this.companyId, year },
        data: { status: PeriodStatus.CLOSED, closedAt: new Date() },
      });
      await tx.fiscalYear.update({
        where: { companyId_year: { companyId: this.companyId, year } },
        data: { status: PeriodStatus.CLOSED },
      });
    });
    return this.periods(year);
  }

  async reopenYear(actorId: string, year: number) {
    const sourceId = String(year);
    const yearRow = await this.prisma.fiscalYear.findUnique({
      where: { companyId_year: { companyId: this.companyId, year } },
    });
    if (!yearRow) throw new NotFoundException('PERIOD_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalPeriod.updateMany({
        where: { companyId: this.companyId, year },
        data: { status: PeriodStatus.OPEN, closedAt: null },
      });
      await tx.fiscalYear.update({ where: { id: yearRow.id }, data: { status: PeriodStatus.OPEN } });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId,
        sourceType: 'YEAR_CLOSE',
        sourceId,
        transactionDate: new Date(`${year}-12-31T12:00:00.000Z`),
      });
    });
    return this.periods(year);
  }

  async listBudgets() {
    const rows = await this.prisma.budget.findMany({
      where: { companyId: this.companyId },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } } },
    });
    return rows.map(presentBudget);
  }

  async saveBudget(dto: SaveBudgetDto) {
    await this.ensureChart();
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('BUDGET_REQUIRED');
    const ids = [...new Set(dto.lines.map((line) => line.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { companyId: this.companyId, id: { in: ids }, status: RecordStatus.ACTIVE },
      select: { id: true, type: true },
    });
    if (accounts.length !== ids.length) throw new BadRequestException('ACCOUNT_INACTIVE');
    if (accounts.some((row) => row.type !== AccountType.INCOME && row.type !== AccountType.EXPENSE)) {
      throw new BadRequestException('BUDGET_PNL_ONLY');
    }
    const merged = new Map<string, { accountId: string; month: number; amount: Prisma.Decimal }>();
    for (const line of dto.lines) {
      const key = `${line.accountId}:${line.month}`;
      const prev = merged.get(key);
      const amount = new Prisma.Decimal(line.amount);
      merged.set(key, {
        accountId: line.accountId,
        month: line.month,
        amount: prev ? prev.amount.plus(amount) : amount,
      });
    }
    const created = await this.prisma.budget.create({
      data: {
        companyId: this.companyId,
        name,
        year: dto.year,
        currency: dto.currency,
        lines: { create: [...merged.values()] },
      },
      include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } } },
    });
    return presentBudget(created);
  }

  async setBudgetStatus(id: string, dto: BudgetStatusDto) {
    const current = await this.prisma.budget.findFirst({ where: { id, companyId: this.companyId } });
    if (!current) throw new NotFoundException('BUDGET_NOT_FOUND');
    if (dto.status === BudgetStatus.ACTIVE) {
      await this.prisma.budget.updateMany({
        where: {
          companyId: this.companyId,
          year: current.year,
          currency: current.currency,
          status: BudgetStatus.ACTIVE,
          NOT: { id },
        },
        data: { status: BudgetStatus.DRAFT },
      });
    }
    const row = await this.prisma.budget.update({
      where: { id },
      data: { status: dto.status },
      include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } } },
    });
    return presentBudget(row);
  }

  async removeBudget(id: string) {
    const current = await this.prisma.budget.findFirst({ where: { id, companyId: this.companyId } });
    if (!current) throw new NotFoundException('BUDGET_NOT_FOUND');
    if (current.status !== BudgetStatus.DRAFT) throw new BadRequestException('BUDGET_ACTIVE');
    await this.prisma.budget.delete({ where: { id } });
    return { id };
  }

  async variance(id: string, from: string, to: string, costCenterId?: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, companyId: this.companyId },
      include: { lines: { include: { account: { select: { id: true, code: true, name: true, type: true, statementLine: true } } } } },
    });
    if (!budget) throw new NotFoundException('BUDGET_NOT_FOUND');
    const fromMonth = Number(from.slice(5, 7));
    const toMonth = Number(to.slice(5, 7));
    const sameYear = from.startsWith(String(budget.year)) && to.startsWith(String(budget.year));
    if (!sameYear) throw new BadRequestException('BUDGET_YEAR');
    const actuals = await this.aggregate(from, to, budget.currency, costCenterId);
    const byAccount = new Map(actuals.filter((row) => row.currency === budget.currency).map((row) => [row.accountId, row]));
    const planned = new Map<string, Prisma.Decimal>();
    for (const line of budget.lines) {
      if (line.month < fromMonth || line.month > toMonth) continue;
      planned.set(line.accountId, (planned.get(line.accountId) ?? new Prisma.Decimal(0)).plus(line.amount));
    }
    const rows = [...planned.entries()].map(([accountId, budgetAmount]) => {
      const account = budget.lines.find((line) => line.accountId === accountId)!.account;
      const actualRow = byAccount.get(accountId);
      const actual = actualRow ? signed(account.type, actualRow.debit, actualRow.credit) : new Prisma.Decimal(0);
      const variance = actual.minus(budgetAmount);
      const favorable = account.type === AccountType.INCOME ? variance.gte(0) : variance.lte(0);
      return {
        accountId,
        code: account.code,
        name: account.name,
        type: account.type,
        line: statementLineOf(account.statementLine, account.type).name,
        budget: money(budgetAmount),
        actual: money(actual),
        variance: money(variance),
        favorable,
      };
    });
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return { budgetId: budget.id, name: budget.name, year: budget.year, currency: budget.currency, from, to, rows };
  }

  private trialBook(currency: Currency, buckets: Bucket[]) {
    const rows = buckets
      .filter((row) => row.currency === currency)
      .map((row) => {
        const net = row.debit.minus(row.credit);
        return {
          code: row.code,
          name: row.name,
          type: row.type,
          debit: money(net.gt(0) ? net : 0),
          credit: money(net.lt(0) ? net.abs() : 0),
        };
      })
      .filter((row) => units(row.debit) !== 0 || units(row.credit) !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));
    const totalDebit = rows.reduce((sum, row) => sum.plus(row.debit), new Prisma.Decimal(0));
    const totalCredit = rows.reduce((sum, row) => sum.plus(row.credit), new Prisma.Decimal(0));
    return {
      currency,
      rows,
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
      balanced: units(totalDebit) === units(totalCredit),
    };
  }

  private pnlBook(currency: Currency, buckets: Bucket[]) {
    const income = rollup(buckets, currency, 'INCOME');
    const expenses = rollup(buckets, currency, 'EXPENSE');
    const sales = amountOf(income, 'SALES');
    const cogs = amountOf(expenses, 'COGS');
    const totalIncome = sumAmounts(income);
    const totalExpense = sumAmounts(expenses);
    return {
      currency,
      income,
      expenses,
      grossProfit: money(sales.minus(cogs)),
      totalIncome: money(totalIncome),
      totalExpense: money(totalExpense),
      netProfit: money(totalIncome.minus(totalExpense)),
    };
  }

  private balanceBook(currency: Currency, buckets: Bucket[]) {
    const assets = rollup(buckets, currency, 'ASSET');
    const liabilities = rollup(buckets, currency, 'LIABILITY');
    const equity = rollup(buckets, currency, 'EQUITY');
    const income = rollup(buckets, currency, 'INCOME');
    const expenses = rollup(buckets, currency, 'EXPENSE');
    const currentEarnings = sumAmounts(income).minus(sumAmounts(expenses));
    const totalAssets = sumAmounts(assets);
    const totalLiabilities = sumAmounts(liabilities);
    if (units(currentEarnings) !== 0) {
      equity.push({ code: 'CURRENT_EARNINGS', name: 'أرباح الفترة', amount: money(currentEarnings) });
    }
    const totalEquity = sumAmounts(equity);
    const difference = totalAssets.minus(totalLiabilities.plus(totalEquity));
    return {
      currency,
      assets,
      liabilities,
      equity,
      currentEarnings: money(currentEarnings),
      totalAssets: money(totalAssets),
      totalLiabilities: money(totalLiabilities),
      totalEquity: money(totalEquity),
      difference: money(difference),
      balanced: units(difference) === 0,
    };
  }

  private async aggregate(
    from: string | undefined,
    to: string,
    currency?: Currency,
    costCenterId?: string,
    view?: { functional: Currency; closing: Prisma.Decimal },
    omitYearClose = false,
  ) {
    await this.ensureChart();
    const centerFilter = await centerLineFilter(this.prisma, this.companyId, costCenterId);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        ...(currency ? { currency } : {}),
        ...centerFilter,
        entry: {
          companyId: this.companyId,
          status: JournalStatus.POSTED,
          transactionDate: {
            ...(from ? { gte: new Date(`${from}T12:00:00.000Z`) } : {}),
            lte: new Date(`${to}T12:00:00.000Z`),
          },
          ...(omitYearClose ? { OR: [{ sourceType: null }, { sourceType: { not: 'YEAR_CLOSE' } }] } : {}),
        },
      },
      select: {
        currency: true,
        debit: true,
        credit: true,
        fxRate: true,
        account: { select: { id: true, code: true, name: true, type: true, statementLine: true } },
      },
    });
    const map = new Map<string, Bucket>();
    for (const line of lines) {
      const converted = view ? translatedLine(line, view.functional, view.closing) : { debit: line.debit, credit: line.credit };
      const bucketCurrency = view ? view.functional : line.currency;
      const key = view ? line.account.id : `${line.account.id}:${line.currency}`;
      const current = map.get(key) ?? {
        accountId: line.account.id,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        line: line.account.statementLine,
        currency: bucketCurrency,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      current.debit = current.debit.plus(converted.debit);
      current.credit = current.credit.plus(converted.credit);
      map.set(key, current);
    }
    const buckets = [...map.values()];
    if (view) {
      for (const row of buckets) {
        const net = new Prisma.Decimal(row.debit.minus(row.credit).toFixed(2));
        row.debit = net.gt(0) ? net : new Prisma.Decimal(0);
        row.credit = net.lt(0) ? net.abs() : new Prisma.Decimal(0);
      }
      buckets.push(...translationPlug(buckets, view.functional));
    }
    return buckets;
  }

  private async setPeriod(id: string, status: PeriodStatus) {
    const current = await this.prisma.fiscalPeriod.findFirst({ where: { id, companyId: this.companyId } });
    if (!current) throw new NotFoundException('PERIOD_NOT_FOUND');
    const row = await this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status, closedAt: status === PeriodStatus.CLOSED ? new Date() : null },
    });
    if (status === PeriodStatus.OPEN) {
      await this.prisma.fiscalYear.update({ where: { id: current.yearId }, data: { status: PeriodStatus.OPEN } });
    }
    return {
      id: row.id,
      year: row.year,
      month: row.month,
      startsOn: isoDate(row.startsOn),
      endsOn: isoDate(row.endsOn),
      status: row.status,
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  }

  private async ensureYear(year: number) {
    const existing = await this.prisma.fiscalYear.findUnique({
      where: { companyId_year: { companyId: this.companyId, year } },
      select: { id: true },
    });
    if (existing) {
      const count = await this.prisma.fiscalPeriod.count({ where: { yearId: existing.id } });
      if (count === 12) return;
    }
    const yearRow = existing
      ? existing
      : await this.prisma.fiscalYear.create({
          data: { companyId: this.companyId, year },
          select: { id: true },
        });
    const present = await this.prisma.fiscalPeriod.findMany({
      where: { yearId: yearRow.id },
      select: { month: true },
    });
    const have = new Set(present.map((row) => row.month));
    const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((month) => !have.has(month));
    if (!missing.length) return;
    await this.prisma.fiscalPeriod.createMany({
      data: missing.map((month) => {
        const bounds = monthBounds(year, month);
        return {
          companyId: this.companyId,
          yearId: yearRow.id,
          year,
          month,
          startsOn: bounds.startsOn,
          endsOn: bounds.endsOn,
        };
      }),
    });
  }

  private revaluationInput(asOf: string, rate: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !(rate > 0)) throw new BadRequestException('BAD_PAYLOAD');
    return { asOf: new Date(`${asOf}T12:00:00.000Z`), rate: new Prisma.Decimal(rate) };
  }

  private async quoteRevaluation(tx: Prisma.TransactionClient, asOf: Date, rate: Prisma.Decimal) {
    const { functional, position } = await replayCurrencyPosition(tx, this.companyId, undefined, asOf);
    const valued = revaluePosition(functional, position.qty, position.cost, rate);
    const gain = valued?.gain ?? new Prisma.Decimal(0);
    const lines = !valued
      ? []
      : gain.gt(0)
        ? [
            { code: '1150', currency: functional, debit: gain, credit: 0, memo: 'إعادة تقييم' },
            { code: '4210', currency: functional, debit: 0, credit: gain, memo: 'إعادة تقييم' },
          ]
        : [
            { code: '5310', currency: functional, debit: gain.abs(), credit: 0, memo: 'إعادة تقييم' },
            { code: '1150', currency: functional, debit: 0, credit: gain.abs(), memo: 'إعادة تقييم' },
          ];
    return {
      functional,
      qty: position.qty,
      carrying: valued?.carrying ?? position.cost,
      closing: valued?.closing ?? position.cost,
      gain,
      rate,
      lines,
    };
  }

  private async ensurePolicy() {
    return this.prisma.accountingPolicy.upsert({
      where: { companyId: this.companyId },
      create: { companyId: this.companyId, functionalCurrency: Currency.USD },
      update: {},
    });
  }

  private async ensureChart() {
    await this.prisma.account.createMany({
      data: SYSTEM_CHART.map((row) => ({ ...row, companyId: this.companyId, system: true })),
      skipDuplicates: true,
    });
    await this.prisma.$transaction(
      SYSTEM_CHART.map((row) =>
        this.prisma.account.updateMany({
          where: { companyId: this.companyId, code: row.code, statementLine: '' },
          data: { statementLine: row.statementLine },
        }),
      ),
    );
  }

  private async cashBooks(
    from: string,
    to: string,
    currency: string | undefined,
    costCenterId: string | undefined,
    view: { functional: Currency; closing: Prisma.Decimal } | undefined,
  ) {
    await this.ensureChart();
    const centerFilter = await centerLineFilter(this.prisma, this.companyId, costCenterId);
    const book = bookCurrency(currency);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        ...(book ? { currency: book } : {}),
        ...centerFilter,
        entry: {
          companyId: this.companyId,
          status: JournalStatus.POSTED,
          transactionDate: {
            gte: new Date(`${from}T12:00:00.000Z`),
            lte: new Date(`${to}T12:00:00.000Z`),
          },
          OR: [{ sourceType: null }, { sourceType: { not: 'YEAR_CLOSE' } }],
        },
      },
      select: {
        currency: true,
        debit: true,
        credit: true,
        fxRate: true,
        entry: { select: { sourceType: true } },
        account: { select: { id: true, code: true, name: true, type: true, statementLine: true } },
      },
    });

    const drafts = new Map<Currency, CashDraft>();
    const ensure = (code: Currency) => {
      const current = drafts.get(code);
      if (current) return current;
      const created: CashDraft = { buckets: new Map(), fx: {}, reval: {} };
      drafts.set(code, created);
      return created;
    };

    for (const line of lines) {
      const key = cashFlowKey(line.account.statementLine, line.account.code);
      const kind = cashFlowClass(key, line.account.type);
      const bucketCurrency = view ? view.functional : line.currency;
      const draft = ensure(bucketCurrency);
      const converted = view ? translatedLine(line, view.functional, view.closing) : { debit: line.debit, credit: line.credit };
      const bucketKey = view ? line.account.id : `${line.account.id}:${line.currency}`;
      const current = draft.buckets.get(bucketKey) ?? {
        accountId: line.account.id,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        line: line.account.statementLine,
        currency: bucketCurrency,
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      current.debit = current.debit.plus(converted.debit);
      current.credit = current.credit.plus(converted.credit);
      draft.buckets.set(bucketKey, current);
      if (view && kind !== 'PROFIT' && kind !== 'NON_CASH') {
        const gap = monetaryRateGap(line, view.functional, view.closing);
        const fxKey = kind === 'CASH' ? 'CASH' : key;
        draft.fx[fxKey] = (draft.fx[fxKey] ?? new Prisma.Decimal(0)).plus(gap);
      }
      if (line.entry.sourceType === 'FX_REVAL' && (kind === 'OPERATING' || kind === 'INVESTING' || kind === 'FINANCING')) {
        const net = converted.debit.minus(converted.credit);
        draft.reval[key] = (draft.reval[key] ?? new Prisma.Decimal(0)).plus(net);
      }
    }

    if (view) {
      const draft = ensure(view.functional);
      for (const plug of translationPlug([...draft.buckets.values()], view.functional)) {
        draft.buckets.set(plug.accountId, plug);
      }
    }

    const codes = view ? [view.functional] : book ? [book] : [Currency.USD, Currency.SYP];
    return codes.map((code) => {
      const draft = drafts.get(code);
      return buildIndirectCashFlow({
        currency: code,
        buckets: draft ? [...draft.buckets.values()] : [],
        fxEffect: draft?.fx,
        revaluation: draft?.reval,
      });
    });
  }

  private async fxView(currency?: string, rate?: number) {
    if (currency !== 'FUNCTIONAL') return undefined;
    if (!(rate && rate > 0)) throw new BadRequestException('FX_CLOSING_RATE');
    const policy = await this.ensurePolicy();
    return { functional: policy.functionalCurrency, closing: new Prisma.Decimal(rate) };
  }

  private equityBook(currency: Currency, openingBuckets: Bucket[], periodBuckets: Bucket[]) {
    const openingEquity = equityTotal(openingBuckets, currency);
    const profit = new Prisma.Decimal(this.pnlBook(currency, periodBuckets).netProfit);
    const movement = (code: string) =>
      periodBuckets
        .filter((row) => row.currency === currency && row.code === code)
        .reduce((sum, row) => sum.plus(row.credit.minus(row.debit)), new Prisma.Decimal(0));
    const capital = movement('3100');
    const retained = movement('3200');
    const closing = openingEquity.plus(profit).plus(capital).plus(retained);
    return {
      currency,
      opening: money(openingEquity),
      profit: money(profit),
      capital: money(capital),
      retained: money(retained),
      closing: money(closing),
    };
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

type CashDraft = {
  buckets: Map<string, Bucket>;
  fx: Record<string, Prisma.Decimal>;
  reval: Record<string, Prisma.Decimal>;
};

function bookCurrency(currency?: string): Currency | undefined {
  if (currency === Currency.USD || currency === Currency.SYP) return currency;
  return undefined;
}

function translationPlug(buckets: Bucket[], functional: Currency): Bucket[] {
  const debit = buckets.reduce((sum, row) => sum.plus(row.debit), new Prisma.Decimal(0));
  const credit = buckets.reduce((sum, row) => sum.plus(row.credit), new Prisma.Decimal(0));
  const gap = debit.minus(credit);
  if (gap.abs().lt('0.0001')) return [];
  const gain = gap.gt(0);
  return [{
    accountId: gain ? 'fx-translation-gain' : 'fx-translation-loss',
    code: gain ? '4210' : '5310',
    name: gain ? 'أرباح الترجمة' : 'خسائر الترجمة',
    type: gain ? AccountType.INCOME : AccountType.EXPENSE,
    line: gain ? 'FX_TRANSLATION_GAIN' : 'FX_TRANSLATION_LOSS',
    currency: functional,
    debit: gain ? new Prisma.Decimal(0) : gap.abs(),
    credit: gain ? gap : new Prisma.Decimal(0),
  }];
}

function rollup(buckets: Bucket[], currency: Currency, section: 'INCOME' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY') {
  const totals = new Map<string, Prisma.Decimal>();
  for (const row of buckets) {
    if (row.currency !== currency) continue;
    const line = statementLineOf(row.line, row.type);
    if (line.section !== section) continue;
    const amount = signed(row.type, row.debit, row.credit);
    totals.set(line.code, (totals.get(line.code) ?? new Prisma.Decimal(0)).plus(amount));
  }
  return STATEMENT_LINES.filter((line) => line.section === section)
    .map((line) => ({ code: line.code, name: line.name, amount: money(totals.get(line.code) ?? 0) }))
    .filter((line) => units(line.amount) !== 0);
}

function signed(type: AccountType, debit: Prisma.Decimal, credit: Prisma.Decimal) {
  if (type === AccountType.ASSET || type === AccountType.EXPENSE) return debit.minus(credit);
  return credit.minus(debit);
}

function amountOf(rows: { code: string; amount: string }[], code: string) {
  return new Prisma.Decimal(rows.find((row) => row.code === code)?.amount ?? 0);
}

function sumAmounts(rows: { amount: string }[]) {
  return rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
}

function money(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value).toFixed(2);
}

function units(value: Prisma.Decimal | string) {
  return Math.round(Number(value) * SCALE);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function equityTotal(buckets: Bucket[], currency: Currency) {
  const equity = rollup(buckets, currency, 'EQUITY');
  const income = rollup(buckets, currency, 'INCOME');
  const expenses = rollup(buckets, currency, 'EXPENSE');
  return sumAmounts(equity).plus(sumAmounts(income)).minus(sumAmounts(expenses));
}

function presentRevaluation(quote: {
  functional: Currency;
  qty: Prisma.Decimal;
  carrying: Prisma.Decimal;
  closing: Prisma.Decimal;
  gain: Prisma.Decimal;
  rate: Prisma.Decimal;
}) {
  return {
    functionalCurrency: quote.functional,
    foreignQty: quote.qty.toFixed(4),
    carrying: quote.carrying.toFixed(2),
    closingValue: quote.closing.toFixed(2),
    gain: quote.gain.toFixed(2),
    rate: quote.rate.toFixed(6),
  };
}

function closingLines(
  rows: {
    code: string;
    type: AccountType;
    currency: Currency;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    fxRate: Prisma.Decimal | null;
  }[],
) {
  const groups = new Map<string, { code: string; type: AccountType; currency: Currency; fxRate: Prisma.Decimal | null; balance: Prisma.Decimal }>();
  for (const row of rows) {
    if (row.type !== AccountType.INCOME && row.type !== AccountType.EXPENSE) continue;
    const rateKey = row.fxRate && row.fxRate.gt(0) ? row.fxRate.toFixed(6) : '';
    const key = `${row.currency}:${row.code}:${rateKey}`;
    const balance = signed(row.type, row.debit, row.credit);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { code: row.code, type: row.type, currency: row.currency, fxRate: rateKey ? row.fxRate : null, balance });
      continue;
    }
    current.balance = current.balance.plus(balance);
  }
  const lines: { code: string; currency: Currency; debit: number; credit: number; fxRate: Prisma.Decimal | null }[] = [];
  const profit = new Map<string, { currency: Currency; fxRate: Prisma.Decimal | null; amount: Prisma.Decimal }>();
  for (const group of groups.values()) {
    if (group.balance.eq(0)) continue;
    const rateKey = group.fxRate && group.fxRate.gt(0) ? group.fxRate.toFixed(6) : '';
    const profitKey = `${group.currency}:${rateKey}`;
    const slice = profit.get(profitKey) ?? { currency: group.currency, fxRate: group.fxRate, amount: new Prisma.Decimal(0) };
    if (group.type === AccountType.INCOME) {
      lines.push({ code: group.code, currency: group.currency, debit: Number(group.balance), credit: 0, fxRate: group.fxRate });
      slice.amount = slice.amount.plus(group.balance);
    } else {
      lines.push({ code: group.code, currency: group.currency, debit: 0, credit: Number(group.balance), fxRate: group.fxRate });
      slice.amount = slice.amount.minus(group.balance);
    }
    profit.set(profitKey, slice);
  }
  for (const slice of profit.values()) {
    if (slice.amount.eq(0)) continue;
    lines.push({
      code: '3200',
      currency: slice.currency,
      debit: slice.amount.lt(0) ? Number(slice.amount.abs()) : 0,
      credit: slice.amount.gt(0) ? Number(slice.amount) : 0,
      fxRate: slice.fxRate,
    });
  }
  return lines;
}

function dayBefore(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function presentBudget(row: {
  id: string;
  name: string;
  year: number;
  currency: Currency;
  status: BudgetStatus;
  lines: {
    accountId: string;
    month: number;
    amount: Prisma.Decimal;
    account: { code: string; name: string; type: AccountType };
  }[];
}) {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    currency: row.currency,
    status: row.status,
    lines: row.lines
      .map((line) => ({
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        month: line.month,
        amount: money(line.amount),
      }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.month - b.month),
  };
}
