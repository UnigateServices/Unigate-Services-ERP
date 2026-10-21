import { BadRequestException } from '@nestjs/common';
import { AccountType, AdvanceType, Currency, FundType, JournalStatus, Prisma, RecordStatus } from '@prisma/client';
import { CUSTODY_ACCOUNT, FX_GAIN_LOSS, SYSTEM_CHART } from './chart';
import { assertPeriodOpen } from './fiscal-period';
import { buildExchangeJournal } from './fx-journal';

import { resolveDimensions } from './cost-centers';
import { unbalancedCurrencies } from './journal-math';

export type SourceLine = {
  code: string;
  currency: Currency;
  debit: Prisma.Decimal | number | string;
  credit: Prisma.Decimal | number | string;
  memo?: string;
  costCenterId?: string | null;
  fxRate?: Prisma.Decimal | number | string | null;
};

type SourceInput = {
  companyId: string;
  actorId: string;
  locationId?: string | null;
  projectId?: string | null;
  transactionDate: Date;
  description: string;
  sourceType: string;
  sourceId: string;
  exchange?: boolean;
  lines: SourceLine[];
};

const FUND_CODE: Record<FundType, string> = {
  VAULT: '1110',
  SHAM_CASH: '1120',
  BANK: '1130',
};

export function fundAccount(fund: FundType) {
  return FUND_CODE[fund];
}

export async function syncOperationJournal(tx: Prisma.TransactionClient, input: SourceInput) {
  await reverseOperationJournal(tx, {
    companyId: input.companyId,
    actorId: input.actorId,
    locationId: input.locationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  await postOperationJournal(tx, input);
}

export async function postOperationJournal(tx: Prisma.TransactionClient, input: SourceInput) {
  const transactionDate = await assertPeriodOpen(tx, input.companyId, input.transactionDate);
  const lines = input.lines.map((line) => ({
    code: line.code,
    currency: line.currency,
    debit: Number(line.debit),
    credit: Number(line.credit),
    memo: line.memo ?? '',
    costCenterId: line.costCenterId ?? null,
    fxRate: line.fxRate != null && line.fxRate !== '' ? new Prisma.Decimal(line.fxRate) : null,
  }));
  if (unbalancedCurrencies(lines).length) throw new BadRequestException('UNBALANCED');

  await tx.account.createMany({
    data: SYSTEM_CHART.map((row) => ({ ...row, companyId: input.companyId, system: true })),
    skipDuplicates: true,
  });
  const accounts = await tx.account.findMany({
    where: { companyId: input.companyId, code: { in: lines.map((line) => line.code) }, status: RecordStatus.ACTIVE },
    select: { id: true, code: true, type: true },
  });
  const byCode = new Map(accounts.map((row) => [row.code, row.id]));
  const typeByCode = new Map(accounts.map((row) => [row.code, row.type]));
  if (lines.some((line) => !byCode.has(line.code))) throw new BadRequestException('ACCOUNT_INACTIVE');
  const headers = await tx.account.count({
    where: { id: { in: [...byCode.values()] }, children: { some: {} } },
  });
  if (headers) throw new BadRequestException('HEADER_ACCOUNT');
  const dimensions = await resolveDimensions(
    tx,
    { companyId: input.companyId, locationId: input.locationId, projectId: input.projectId },
    lines.map((line) => {
      const type = typeByCode.get(line.code);
      return {
        profitAndLoss: type === AccountType.INCOME || type === AccountType.EXPENSE,
        costCenterId: line.costCenterId,
      };
    }),
  );

  const key = sourceKey(input.sourceType, input.sourceId);
  const live = await tx.journalEntry.findUnique({ where: { sourceKey: key }, select: { id: true } });
  if (live) throw new BadRequestException('ENTRY_EXISTS');

  const last = await tx.journalEntry.findFirst({
    where: { companyId: input.companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      number: (last?.number ?? 0) + 1,
      transactionDate,
      description: input.description,
      status: JournalStatus.POSTED,
      postedAt: new Date(),
      employeeId: input.actorId,
      locationId: input.locationId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceKey: key,
      exchange: Boolean(input.exchange),
      lines: {
        create: lines.map((line, index) => ({
          accountId: byCode.get(line.code)!,
          currency: line.currency,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
          sortOrder: index,
          costCenterId: dimensions[index].costCenterId,
          projectId: dimensions[index].projectId,
          fxRate: line.fxRate,
        })),
      },
    },
  });
}

export async function reverseOperationJournal(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actorId: string;
    locationId?: string | null;
    sourceType: string;
    sourceId: string;
    transactionDate?: Date;
  },
) {
  const key = sourceKey(input.sourceType, input.sourceId);
  const current = await tx.journalEntry.findUnique({
    where: { sourceKey: key },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!current || current.status !== JournalStatus.POSTED) return;
  const transactionDate = await assertPeriodOpen(tx, input.companyId, input.transactionDate ?? new Date());
  await tx.journalEntry.update({ where: { id: current.id }, data: { sourceKey: null } });
  const last = await tx.journalEntry.findFirst({
    where: { companyId: input.companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      number: (last?.number ?? 0) + 1,
      transactionDate,
      description: `عكس القيد ${current.number}`,
      status: JournalStatus.POSTED,
      postedAt: new Date(),
      employeeId: input.actorId,
      locationId: input.locationId ?? current.locationId,
      reversalOfId: current.id,
      exchange: current.exchange,
      sourceType: current.sourceType,
      sourceId: current.sourceId,
      lines: {
        create: current.lines.map((line, index) => ({
          accountId: line.accountId,
          currency: line.currency,
          debit: line.credit,
          credit: line.debit,
          memo: line.memo,
          sortOrder: index,
          costCenterId: line.costCenterId,
          projectId: line.projectId,
          fxRate: line.fxRate,
        })),
      },
    },
  });
}

function sourceKey(type: string, id: string) {
  return `${type}:${id}`;
}

const KIND_SOURCE = {
  income: 'INCOME',
  outcome: 'OUTCOME',
  exchange: 'EXCHANGE',
  transfer: 'TRANSFER',
  advance: 'ADVANCE',
} as const;

export async function syncLiveOperation(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  kind: keyof typeof KIND_SOURCE,
  id: string,
) {
  const sourceType = KIND_SOURCE[kind];
  if (kind === 'income') {
    const row = await tx.income.findFirstOrThrow({ where: { id, companyId } });
    await syncOperationJournal(tx, {
      companyId,
      actorId,
      locationId: row.locationId,
      projectId: row.projectId,
      transactionDate: row.transactionDate,
      description: `وارد ${row.reference}`,
      sourceType,
      sourceId: row.id,
      lines: [
        { code: fundAccount(row.fund), currency: row.currency, debit: row.total, credit: 0, fxRate: row.fxRate },
        { code: '4900', currency: row.currency, debit: 0, credit: row.total, fxRate: row.fxRate },
      ],
    });
    return;
  }
  if (kind === 'outcome') {
    const row = await tx.outcome.findFirstOrThrow({ where: { id, companyId } });
    await syncOperationJournal(tx, {
      companyId,
      actorId,
      locationId: row.locationId,
      projectId: row.projectId,
      transactionDate: row.transactionDate,
      description: `صادر ${row.reference}`,
      sourceType,
      sourceId: row.id,
      lines: [
        { code: '5200', currency: row.currency, debit: row.total, credit: 0, fxRate: row.fxRate },
        { code: fundAccount(row.fund), currency: row.currency, debit: 0, credit: row.total, fxRate: row.fxRate },
      ],
    });
    return;
  }
  if (kind === 'exchange') {
    const row = await tx.exchange.findFirstOrThrow({ where: { id, companyId } });
    await syncOperationJournal(
      tx,
      await buildExchangeJournal(tx, { companyId, actorId, fundCode: fundAccount(row.fund), row }),
    );
    return;
  }
  if (kind === 'transfer') {
    const row = await tx.transfer.findFirstOrThrow({ where: { id, companyId } });
    await syncOperationJournal(tx, {
      companyId,
      actorId,
      locationId: row.locationId,
      transactionDate: row.transactionDate,
      description: `تحويل ${row.reference}`,
      sourceType,
      sourceId: row.id,
      lines: [
        { code: fundAccount(row.toFund), currency: row.currency, debit: row.amount, credit: 0, fxRate: row.fxRate },
        { code: fundAccount(row.fromFund), currency: row.currency, debit: 0, credit: row.amount, fxRate: row.fxRate },
      ],
    });
    return;
  }
  const row = await tx.advance.findFirstOrThrow({ where: { id, companyId } });
  await syncOperationJournal(tx, await operationJournalForAdvance(tx, companyId, actorId, row));
}

export async function operationJournalForAdvance(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  row: {
    id: string;
    reference: string;
    transactionDate: Date;
    locationId: string | null;
    projectId: string | null;
    advanceType: AdvanceType;
    currency: Currency;
    total: Prisma.Decimal;
    amount: Prisma.Decimal;
    fromCurrency: Currency | null;
    toCurrency: Currency | null;
    exchangeRate: Prisma.Decimal | null;
    fund: FundType | null;
  },
) {
  if (row.advanceType === AdvanceType.ISSUE || row.advanceType === AdvanceType.RETURN) {
    // The only advance vouchers that move cash: custody leaves the fund (ISSUE) or comes back to it (RETURN).
    if (!row.fund) throw new BadRequestException('FUNDS_REQUIRED');
    const issue = row.advanceType === AdvanceType.ISSUE;
    const cash = fundAccount(row.fund);
    const fxDiff = !issue ? await custodyAllocationFxDiff(tx, companyId, row.id) : new Prisma.Decimal(0);
    const functional = !fxDiff.eq(0) ? await tx.accountingPolicy.findUnique({ where: { companyId }, select: { functionalCurrency: true } }) : null;
    const funcCode = functional?.functionalCurrency ?? Currency.USD;
    const lines: SourceLine[] = [
      {
        code: issue ? CUSTODY_ACCOUNT : cash,
        currency: row.currency,
        debit: row.total,
        credit: 0,
        fxRate: row.exchangeRate,
      },
      {
        code: issue ? cash : CUSTODY_ACCOUNT,
        currency: row.currency,
        debit: 0,
        credit: row.total,
        fxRate: row.exchangeRate,
      },
    ];
    if (!fxDiff.eq(0)) {
      const absDiff = fxDiff.abs();
      if (fxDiff.gt(0)) {
        lines.push(
          { code: '1150', currency: funcCode, debit: absDiff, credit: 0, fxRate: null, memo: 'فرق صرف محقق' },
          { code: FX_GAIN_LOSS, currency: funcCode, debit: 0, credit: absDiff, fxRate: null, memo: 'ربح فرق صرف محقق' },
        );
      } else {
        lines.push(
          { code: FX_GAIN_LOSS, currency: funcCode, debit: absDiff, credit: 0, fxRate: null, memo: 'خسارة فرق صرف محققة' },
          { code: '1150', currency: funcCode, debit: 0, credit: absDiff, fxRate: null, memo: 'فرق صرف محقق' },
        );
      }
    }
    return {
      companyId,
      actorId,
      locationId: row.locationId,
      transactionDate: row.transactionDate,
      description: `${issue ? 'صرف عهدة' : 'استرداد عهدة'} ${row.reference}`,
      sourceType: 'ADVANCE',
      sourceId: row.id,
      lines,
    };
  }
  if (row.advanceType === AdvanceType.EXCHANGE && row.fromCurrency && row.toCurrency && row.exchangeRate) {
    const fromCurrency = row.fromCurrency;
    const toCurrency = row.toCurrency;
    const exchangeRate = row.exchangeRate;
    return buildExchangeJournal(tx, {
      companyId,
      actorId,
      fundCode: CUSTODY_ACCOUNT,
      sourceType: 'ADVANCE',
      description: `سلفة ${row.reference}`,
      projectId: row.projectId,
      exclude: { advanceId: row.id },
      row: {
        id: row.id,
        reference: row.reference,
        transactionDate: row.transactionDate,
        locationId: row.locationId,
        exchangeRate,
        paidCurrency: fromCurrency,
        receivedCurrency: toCurrency,
        exchangeAmount: row.amount,
        total: row.total,
      },
    });
  }
  const fxDiff = await custodyAllocationFxDiff(tx, companyId, row.id);
  const functional = !fxDiff.eq(0) ? await tx.accountingPolicy.findUnique({ where: { companyId }, select: { functionalCurrency: true } }) : null;
  const funcCode = functional?.functionalCurrency ?? Currency.USD;
  const lines: SourceLine[] = [
    { code: '5200', currency: row.currency, debit: row.total, credit: 0, fxRate: row.exchangeRate },
    { code: CUSTODY_ACCOUNT, currency: row.currency, debit: 0, credit: row.total, fxRate: row.exchangeRate },
  ];
  if (!fxDiff.eq(0)) {
    const absDiff = fxDiff.abs();
    if (fxDiff.gt(0)) {
      lines.push(
        { code: '1150', currency: funcCode, debit: absDiff, credit: 0, fxRate: null, memo: 'فرق صرف محقق' },
        { code: FX_GAIN_LOSS, currency: funcCode, debit: 0, credit: absDiff, fxRate: null, memo: 'ربح فرق صرف محقق' },
      );
    } else {
      lines.push(
        { code: FX_GAIN_LOSS, currency: funcCode, debit: absDiff, credit: 0, fxRate: null, memo: 'خسارة فرق صرف محققة' },
        { code: '1150', currency: funcCode, debit: 0, credit: absDiff, fxRate: null, memo: 'فرق صرف محقق' },
      );
    }
  }
  return {
    companyId,
    actorId,
    locationId: row.locationId,
    projectId: row.projectId,
    transactionDate: row.transactionDate,
    description: `سلفة ${row.reference}`,
    sourceType: 'ADVANCE',
    sourceId: row.id,
    lines,
  };
}

async function custodyAllocationFxDiff(tx: Prisma.TransactionClient, companyId: string, advanceId: string) {
  if (!tx?.openItemAllocation) return new Prisma.Decimal(0);
  const rows = await tx.openItemAllocation.findMany({
    where: { companyId, sourceType: 'ADVANCE', sourceId: advanceId },
    select: { fxDifference: true },
  });
  return rows.reduce((sum, row) => sum.plus(row.fxDifference), new Prisma.Decimal(0));
}

export async function reverseLiveOperation(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  kind: keyof typeof KIND_SOURCE,
  id: string,
  locationId?: string | null,
) {
  await reverseOperationJournal(tx, {
    companyId,
    actorId,
    locationId,
    sourceType: KIND_SOURCE[kind],
    sourceId: id,
  });
}
