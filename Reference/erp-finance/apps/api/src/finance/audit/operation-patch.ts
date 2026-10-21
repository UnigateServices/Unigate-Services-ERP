import { BadRequestException } from '@nestjs/common';
import {
  Advance,
  AdvanceType,
  Currency,
  Exchange,
  ExchangeType,
  FundType,
  Income,
  Outcome,
  Prisma,
  RecordStatus,
  Transfer,
} from '@prisma/client';
import { convertByRate, exchangeDirection } from '../exchanges/exchange-math';
import { foreignOperationRate } from '../ledger/fx-journal';
import { isSameFundTransfer } from '../transfers/transfer-rules';
import { OperationPatchDto } from './dto/create-audit-request.dto';

export type OpKind = 'income' | 'outcome' | 'exchange' | 'transfer' | 'advance';

type DbClient = Pick<Prisma.TransactionClient, 'project' | 'bank' | 'borrower'>;

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function decimalNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null || value === '') return 0;
  return Number(value);
}

function isDecimalLike(value: unknown): value is { toNumber: () => number; toString: () => string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as { toNumber?: unknown }).toNumber === 'function',
  );
}

export function snapshotOp(kind: OpKind, row: Record<string, unknown>): Prisma.InputJsonValue {
  const skip = new Set([
    'companyId',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'attachments',
    'project',
    'bank',
    'fromBank',
    'toBank',
    'borrower',
    'employee',
    'location',
  ]);
  const out: Record<string, unknown> = { kind };
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key)) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
    } else if (isDecimalLike(value)) {
      out[key] = value.toString();
    } else {
      out[key] = value;
    }
  }
  const project = row.project as { name?: string } | null | undefined;
  const bank = row.bank as { name?: string } | null | undefined;
  const fromBank = row.fromBank as { name?: string } | null | undefined;
  const toBank = row.toBank as { name?: string } | null | undefined;
  const borrower = row.borrower as { name?: string } | null | undefined;
  if (project?.name) out.projectName = project.name;
  if (bank?.name) out.bankName = bank.name;
  if (fromBank?.name) out.fromBankName = fromBank.name;
  if (toBank?.name) out.toBankName = toBank.name;
  if (borrower?.name) out.borrowerName = borrower.name;
  return out as Prisma.InputJsonValue;
}

export function compactPatch(patch: object): Prisma.InputJsonValue {
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && key !== 'locationId') {
      out[key] = value as Prisma.InputJsonValue;
    }
  }
  return out;
}

export function asPatch(value: Prisma.JsonValue): OperationPatchDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('BAD_PAYLOAD');
  }
  return value as OperationPatchDto;
}

async function requireProject(db: DbClient, companyId: string, id: string, showIn: string) {
  const project = await db.project.findFirst({
    where: { id, companyId, status: RecordStatus.ACTIVE },
  });
  if (!project) {
    throw new BadRequestException('PROJECT_REQUIRED');
  }
  if (!project.showIn.includes(showIn)) {
    if (showIn === 'INCOME') throw new BadRequestException('PROJECT_NOT_FOR_INCOME');
    if (showIn === 'OUTCOME') throw new BadRequestException('PROJECT_NOT_FOR_OUTCOME');
    throw new BadRequestException('PROJECT_NOT_FOR_LOANS');
  }
  return project;
}

async function requireBank(db: DbClient, companyId: string, id?: string | null) {
  if (!id) {
    throw new BadRequestException('BANK_REQUIRED');
  }
  const bank = await db.bank.findFirst({
    where: { id, companyId, status: RecordStatus.ACTIVE },
  });
  if (!bank) {
    throw new BadRequestException('BANK_REQUIRED');
  }
  return bank;
}

async function requireBorrower(db: DbClient, companyId: string, id?: string | null) {
  if (!id) {
    throw new BadRequestException('BORROWER_REQUIRED');
  }
  const borrower = await db.borrower.findFirst({
    where: { id, companyId, status: RecordStatus.ACTIVE },
  });
  if (!borrower) {
    throw new BadRequestException('BORROWER_REQUIRED');
  }
  return borrower;
}

async function resolveBankId(
  db: DbClient,
  companyId: string,
  fund: FundType,
  requested: string | null | undefined,
  current: string | null,
) {
  if (fund !== FundType.BANK) return null;
  const bank = await requireBank(db, companyId, requested ?? current);
  return bank.id;
}

export async function incomeUpdateData(
  db: DbClient,
  companyId: string,
  row: Income,
  patch: OperationPatchDto,
): Promise<Prisma.IncomeUncheckedUpdateInput> {
  const fund = (patch.fund as FundType) || row.fund;
  const projectId = patch.projectId ?? row.projectId;
  if (!projectId) {
    throw new BadRequestException('PROJECT_REQUIRED');
  }
  const project = await requireProject(db, companyId, projectId, 'INCOME');
  const quantity =
    patch.quantity != null ? (patch.quantity > 0 ? patch.quantity : 1) : decimalNumber(row.quantity) || 1;
  const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
  const total = roundMoney(quantity * amount);
  if (total <= 0) {
    throw new BadRequestException('AMOUNT_INVALID');
  }

  const transactionDate = patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate;
  const currency = (patch.currency as Currency) || row.currency;
  const fxRate = await foreignOperationRate(db as Prisma.TransactionClient, companyId, currency, undefined, {
    date: transactionDate,
  });

  return {
    transactionDate,
    projectId: project.id,
    description: patch.description !== undefined ? patch.description.trim() : row.description,
    fund,
    bankId: await resolveBankId(db, companyId, fund, patch.bankId, row.bankId),
    sender: patch.sender !== undefined ? patch.sender.trim() : row.sender,
    receiver: patch.receiver !== undefined ? patch.receiver.trim() : row.receiver,
    currency,
    fxRate,
    quantity: new Prisma.Decimal(quantity.toFixed(4)),
    amount: new Prisma.Decimal(amount.toFixed(4)),
    total: new Prisma.Decimal(total.toFixed(4)),
    notes: patch.notes !== undefined ? patch.notes.trim() : row.notes,
  };
}

export async function outcomeUpdateData(
  db: DbClient,
  companyId: string,
  row: Outcome,
  patch: OperationPatchDto,
): Promise<Prisma.OutcomeUncheckedUpdateInput> {
  const fund = (patch.fund as FundType) || row.fund;
  const projectId = patch.projectId ?? row.projectId;
  if (!projectId) {
    throw new BadRequestException('PROJECT_REQUIRED');
  }
  const project = await requireProject(db, companyId, projectId, 'OUTCOME');
  const quantity =
    patch.quantity != null ? (patch.quantity > 0 ? patch.quantity : 1) : decimalNumber(row.quantity) || 1;
  const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
  const total = roundMoney(quantity * amount);
  if (total <= 0) {
    throw new BadRequestException('AMOUNT_INVALID');
  }

  const transactionDate = patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate;
  const currency = (patch.currency as Currency) || row.currency;
  const fxRate = await foreignOperationRate(db as Prisma.TransactionClient, companyId, currency, undefined, {
    date: transactionDate,
  });

  return {
    transactionDate,
    projectId: project.id,
    description: patch.description !== undefined ? patch.description.trim() : row.description,
    fund,
    bankId: await resolveBankId(db, companyId, fund, patch.bankId, row.bankId),
    deliverer: patch.deliverer !== undefined ? patch.deliverer.trim() : row.deliverer,
    receiver: patch.receiver !== undefined ? patch.receiver.trim() : row.receiver,
    currency,
    fxRate,
    quantity: new Prisma.Decimal(quantity.toFixed(4)),
    amount: new Prisma.Decimal(amount.toFixed(4)),
    total: new Prisma.Decimal(total.toFixed(4)),
    notes: patch.notes !== undefined ? patch.notes.trim() : row.notes,
  };
}

export async function exchangeUpdateData(
  db: DbClient,
  companyId: string,
  row: Exchange,
  patch: OperationPatchDto,
): Promise<Prisma.ExchangeUncheckedUpdateInput> {
  const fund = (patch.fund as FundType) || row.fund;
  const exchangeType = (patch.exchangeType as ExchangeType) || row.exchangeType;
  const direction = exchangeDirection(exchangeType);
  const exchangeAmount = patch.exchangeAmount != null ? patch.exchangeAmount : decimalNumber(row.exchangeAmount);
  const exchangeRate = patch.exchangeRate != null ? patch.exchangeRate : decimalNumber(row.exchangeRate);
  const total = convertByRate(exchangeAmount, exchangeRate, direction.from, direction.to);
  if (!(exchangeAmount > 0 && exchangeRate > 0 && total > 0)) {
    throw new BadRequestException('AMOUNT_INVALID');
  }

  return {
    transactionDate: patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate,
    fund,
    bankId: await resolveBankId(db, companyId, fund, patch.bankId, row.bankId),
    exchangeType,
    paidCurrency: direction.from,
    receivedCurrency: direction.to,
    amountCurrency: direction.from,
    exchangeAmount: new Prisma.Decimal(exchangeAmount.toFixed(4)),
    exchangeRate: new Prisma.Decimal(exchangeRate.toFixed(6)),
    total: new Prisma.Decimal(total.toFixed(4)),
    notes: patch.notes !== undefined ? patch.notes.trim() : row.notes,
  };
}

export async function transferUpdateData(
  db: DbClient,
  companyId: string,
  row: Transfer,
  patch: OperationPatchDto,
): Promise<Prisma.TransferUncheckedUpdateInput> {
  const fromFund = (patch.fromFund as FundType) || row.fromFund;
  const toFund = (patch.toFund as FundType) || row.toFund;
  const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
  if (!(amount > 0)) {
    throw new BadRequestException('AMOUNT_INVALID');
  }

  const fromBankId =
    fromFund === FundType.BANK
      ? (await requireBank(db, companyId, patch.fromBankId ?? row.fromBankId)).id
      : null;
  const toBankId =
    toFund === FundType.BANK ? (await requireBank(db, companyId, patch.toBankId ?? row.toBankId)).id : null;

  if (isSameFundTransfer(fromFund, toFund, fromBankId, toBankId)) {
    throw new BadRequestException('SAME_FUND');
  }

  const currency = (patch.currency as Currency) || row.currency;
  const txDate = patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate;
  const fxRate = await foreignOperationRate(
    db as Prisma.TransactionClient,
    companyId,
    currency,
    undefined,
    { date: txDate },
  );

  return {
    transactionDate: patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate,
    fromFund,
    toFund,
    fromBankId,
    toBankId,
    currency,
    fxRate,
    amount: new Prisma.Decimal(amount.toFixed(4)),
    notes: patch.notes !== undefined ? patch.notes.trim() : row.notes,
  };
}

export async function advanceUpdateData(
  db: DbClient,
  companyId: string,
  row: Advance,
  patch: OperationPatchDto,
): Promise<Prisma.AdvanceUncheckedUpdateInput> {
  const borrower = await requireBorrower(db, companyId, patch.borrowerId ?? row.borrowerId);
  const advanceType = (patch.advanceType as AdvanceType) || row.advanceType;
  const notes = patch.notes !== undefined ? patch.notes.trim() : row.notes;
  const transactionDate = patch.transactionDate ? parseDateOnly(patch.transactionDate) : row.transactionDate;

  if (advanceType === AdvanceType.ISSUE || advanceType === AdvanceType.RETURN) {
    const fund = (patch.fund as FundType) || row.fund;
    if (!fund) {
      throw new BadRequestException('FUNDS_REQUIRED');
    }
    const currency = (patch.currency as Currency) || row.currency;
    const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
    const total = roundMoney(amount);
    if (!(total > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    return {
      transactionDate,
      borrowerId: borrower.id,
      advanceType,
      projectId: null,
      description: patch.description !== undefined ? patch.description.trim() : row.description,
      receiver: patch.receiver !== undefined ? patch.receiver.trim() : row.receiver,
      currency,
      quantity: null,
      amount: new Prisma.Decimal(total.toFixed(4)),
      total: new Prisma.Decimal(total.toFixed(4)),
      exchangeRate: await foreignOperationRate(db as Prisma.TransactionClient, companyId, currency, undefined, {
        date: transactionDate,
      }),
      fromCurrency: null,
      toCurrency: null,
      fund,
      bankId: await resolveBankId(db, companyId, fund, patch.bankId, row.bankId),
      notes,
    };
  }

  if (advanceType === AdvanceType.EXCHANGE) {
    const from = (patch.fromCurrency as Currency) || row.fromCurrency;
    const to = (patch.toCurrency as Currency) || row.toCurrency;
    if (!from || !to) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    if (from === to) {
      throw new BadRequestException('SAME_CURRENCY');
    }
    const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
    const exchangeRate = patch.exchangeRate != null ? patch.exchangeRate : decimalNumber(row.exchangeRate);
    if (!(exchangeRate > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    const total = convertByRate(amount, exchangeRate, from, to);
    if (!(amount > 0 && total > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    return {
      transactionDate,
      borrowerId: borrower.id,
      advanceType,
      projectId: null,
      description: '',
      receiver: '',
      currency: from,
      quantity: null,
      amount: new Prisma.Decimal(amount.toFixed(4)),
      exchangeRate: new Prisma.Decimal(exchangeRate.toFixed(6)),
      total: new Prisma.Decimal(total.toFixed(4)),
      fromCurrency: from,
      toCurrency: to,
      fund: null,
      bankId: null,
      notes,
    };
  }

  const currency = (patch.currency as Currency) || row.currency;
  const quantity =
    patch.quantity != null ? (patch.quantity > 0 ? patch.quantity : 1) : decimalNumber(row.quantity) || 1;
  const amount = patch.amount != null ? patch.amount : decimalNumber(row.amount);
  const total = roundMoney(quantity * amount);
  if (total <= 0) {
    throw new BadRequestException('AMOUNT_INVALID');
  }
  const projectId = patch.projectId ?? row.projectId;
  if (!projectId) {
    throw new BadRequestException('PROJECT_REQUIRED');
  }
  const project = await requireProject(db, companyId, projectId, 'LOANS');

  return {
    transactionDate,
    borrowerId: borrower.id,
    advanceType,
    projectId: project.id,
    description: patch.description !== undefined ? patch.description.trim() : row.description,
    receiver: patch.receiver !== undefined ? patch.receiver.trim() : row.receiver,
    currency,
    quantity: new Prisma.Decimal(quantity.toFixed(4)),
    amount: new Prisma.Decimal(amount.toFixed(4)),
    total: new Prisma.Decimal(total.toFixed(4)),
    exchangeRate: await foreignOperationRate(db as Prisma.TransactionClient, companyId, currency, undefined, {
      date: transactionDate,
    }),
    fromCurrency: null,
    toCurrency: null,
    fund: null,
    bankId: null,
    notes,
  };
}

export async function applyOperationPatch(
  tx: Prisma.TransactionClient,
  kind: OpKind,
  id: string,
  row: Income | Outcome | Exchange | Transfer | Advance,
  companyId: string,
  patch: OperationPatchDto,
) {
  if (kind === 'income') {
    const data = await incomeUpdateData(tx, companyId, row as Income, patch);
    return tx.income.update({ where: { id }, data });
  }
  if (kind === 'outcome') {
    const data = await outcomeUpdateData(tx, companyId, row as Outcome, patch);
    return tx.outcome.update({ where: { id }, data });
  }
  if (kind === 'exchange') {
    const data = await exchangeUpdateData(tx, companyId, row as Exchange, patch);
    return tx.exchange.update({ where: { id }, data });
  }
  if (kind === 'transfer') {
    const data = await transferUpdateData(tx, companyId, row as Transfer, patch);
    return tx.transfer.update({ where: { id }, data });
  }
  const data = await advanceUpdateData(tx, companyId, row as Advance, patch);
  return tx.advance.update({ where: { id }, data });
}

export async function validateOperationPatch(
  db: DbClient,
  kind: OpKind,
  row: Income | Outcome | Exchange | Transfer | Advance,
  companyId: string,
  patch: OperationPatchDto,
) {
  if (kind === 'income') return incomeUpdateData(db, companyId, row as Income, patch);
  if (kind === 'outcome') return outcomeUpdateData(db, companyId, row as Outcome, patch);
  if (kind === 'exchange') return exchangeUpdateData(db, companyId, row as Exchange, patch);
  if (kind === 'transfer') return transferUpdateData(db, companyId, row as Transfer, patch);
  return advanceUpdateData(db, companyId, row as Advance, patch);
}
