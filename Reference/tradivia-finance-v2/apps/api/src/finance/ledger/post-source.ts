import { BadRequestException } from '@nestjs/common';
import { AdvanceType, Currency, FundType, JournalStatus, Prisma, RecordStatus } from '@prisma/client';
import { SYSTEM_CHART } from './chart';
import { assertPeriodOpen } from './fiscal-period';
import { buildExchangeJournal } from './fx-journal';

import { resolveCostCenter } from './cost-centers';
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
  costCenterId?: string | null;
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
  ADVANCES: '1300',
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
    select: { id: true, code: true },
  });
  const byCode = new Map(accounts.map((row) => [row.code, row.id]));
  if (lines.some((line) => !byCode.has(line.code))) throw new BadRequestException('ACCOUNT_INACTIVE');
  const headers = await tx.account.count({
    where: { id: { in: [...byCode.values()] }, children: { some: {} } },
  });
  if (headers) throw new BadRequestException('HEADER_ACCOUNT');
  const entryCenter = await resolveCostCenter(tx, input);
  const lineCenters = await Promise.all(
    lines.map((line) =>
      line.costCenterId
        ? resolveCostCenter(tx, { companyId: input.companyId, costCenterId: line.costCenterId })
        : Promise.resolve(entryCenter),
    ),
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
          costCenterId: lineCenters[index],
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
  },
) {
  if (row.advanceType === AdvanceType.EXCHANGE && row.fromCurrency && row.toCurrency && row.exchangeRate) {
    const fromCurrency = row.fromCurrency;
    const toCurrency = row.toCurrency;
    const exchangeRate = row.exchangeRate;
    return buildExchangeJournal(tx, {
      companyId,
      actorId,
      fundCode: '1300',
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
  return {
    companyId,
    actorId,
    locationId: row.locationId,
    projectId: row.projectId,
    transactionDate: row.transactionDate,
    description: `سلفة ${row.reference}`,
    sourceType: 'ADVANCE',
    sourceId: row.id,
    lines: [
      { code: '5200', currency: row.currency, debit: row.total, credit: 0, fxRate: row.exchangeRate },
      { code: '1300', currency: row.currency, debit: 0, credit: row.total, fxRate: row.exchangeRate },
    ],
  };
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
