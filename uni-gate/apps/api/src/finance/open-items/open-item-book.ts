import { BadRequestException } from '@nestjs/common';
import {
  Currency,
  OpenItemKind,
  OpenItemParty,
  OpenItemStatus,
  Prisma,
  SettlementMode,
} from '@prisma/client';
import { FX_GAIN_LOSS } from '../ledger/chart';
import { functionalCurrency } from '../ledger/fx-journal';
import { postOperationJournal, SourceLine } from '../ledger/post-source';

const ZERO = new Prisma.Decimal(0);

export const CONTROL_ACCOUNT: Record<OpenItemKind, string> = {
  RECEIVABLE: '1200',
  PAYABLE: '2100',
  ADVANCE_IN: '1250',
  ADVANCE_OUT: '2150',
  CUSTODY: '1300',
};

const DEBIT_KIND = new Set<OpenItemKind>([OpenItemKind.RECEIVABLE, OpenItemKind.ADVANCE_IN, OpenItemKind.CUSTODY]);

export type ItemAmount = { kind: OpenItemKind; amount: Prisma.Decimal };

function roundFunctional(currency: Currency, value: Prisma.Decimal) {
  const places = currency === Currency.SYP ? 0 : 2;
  return value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Converts a foreign-currency amount into functional currency using the given rate.
 * For the USD/SYP pair, the stored rate is always Syrian pounds per 1 USD.
 */
export function toFunctionalAmount(
  amount: Prisma.Decimal,
  currency: Currency,
  functional: Currency,
  rate: Prisma.Decimal,
) {
  if (currency === functional) return roundFunctional(functional, amount);
  if (rate.lte(0)) return ZERO;
  const isUsdSyp =
    (currency === Currency.USD || currency === Currency.SYP) &&
    (functional === Currency.USD || functional === Currency.SYP);
  const raw = isUsdSyp
    ? functional === Currency.SYP
      ? amount.mul(rate)
      : amount.div(rate)
    : amount.div(rate);
  return roundFunctional(functional, raw);
}

/**
 * Computes realized FX difference and balanced journal lines when settling a monetary open item
 * (invoice / receivable / payable / custody / advance).
 *
 * - Control account is closed at the original document rate (`itemFxRate`).
 * - Cash / offsetting account moves at the settlement-day rate (`settlementFxRate`).
 * - Any difference in functional currency is posted to `FX_GAIN_LOSS` (4220) with a balanced entry:
 *   When the settlement currency is foreign vs functional, the foreign-currency legs balance in the
 *   foreign currency, while the functional-currency FX difference is posted between `1150` (foreign
 *   currency position / valuation bridge) and `FX_GAIN_LOSS` (4220) so every currency book stays balanced.
 *   In single-currency functional view (or when settling in functional currency), the control account is
 *   relieved at original cost, cash moves at settlement value, and `FX_GAIN_LOSS` absorbs the gap.
 */
export function buildSettlementFxJournal(input: {
  kind: OpenItemKind;
  currency: Currency;
  functional: Currency;
  amount: Prisma.Decimal;
  originalFxRate: Prisma.Decimal | null;
  settlementFxRate: Prisma.Decimal | null;
  cashOrOffsetCode: string;
  controlCode?: string;
}): {
  fxDifference: Prisma.Decimal;
  originalFunctional: Prisma.Decimal;
  settlementFunctional: Prisma.Decimal;
  lines: SourceLine[];
  functionalEntryLines: { code: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[];
} {
  const control = input.controlCode ?? CONTROL_ACCOUNT[input.kind];
  const isDebitControl = DEBIT_KIND.has(input.kind);
  const { currency, functional, amount, originalFxRate, settlementFxRate, cashOrOffsetCode } = input;

  if (currency === functional || !originalFxRate || !settlementFxRate || originalFxRate.lte(0) || settlementFxRate.lte(0)) {
    const val = roundFunctional(functional, amount);
    const lines: SourceLine[] = isDebitControl
      ? [
          { code: cashOrOffsetCode, currency, debit: amount, credit: 0, fxRate: settlementFxRate ?? originalFxRate },
          { code: control, currency, debit: 0, credit: amount, fxRate: originalFxRate },
        ]
      : [
          { code: control, currency, debit: amount, credit: 0, fxRate: originalFxRate },
          { code: cashOrOffsetCode, currency, debit: 0, credit: amount, fxRate: settlementFxRate ?? originalFxRate },
        ];
    const functionalEntryLines = isDebitControl
      ? [
          { code: cashOrOffsetCode, debit: val, credit: ZERO },
          { code: control, debit: ZERO, credit: val },
        ]
      : [
          { code: control, debit: val, credit: ZERO },
          { code: cashOrOffsetCode, debit: ZERO, credit: val },
        ];
    return {
      fxDifference: ZERO,
      originalFunctional: val,
      settlementFunctional: val,
      lines,
      functionalEntryLines,
    };
  }

  const originalFunctional = toFunctionalAmount(amount, currency, functional, originalFxRate);
  const settlementFunctional = toFunctionalAmount(amount, currency, functional, settlementFxRate);

  // For a debit item (RECEIVABLE / CUSTODY / ADVANCE_IN):
  //   Cash received is worth `settlementFunctional`, Receivable relieved was carried at `originalFunctional`.
  //   Gain = settlementFunctional - originalFunctional (> 0 is gain, < 0 is loss).
  // For a credit item (PAYABLE / ADVANCE_OUT):
  //   Payable relieved was carried at `originalFunctional`, Cash paid is worth `settlementFunctional`.
  //   Gain = originalFunctional - settlementFunctional (> 0 is gain, < 0 is loss).
  const fxDifference = isDebitControl
    ? settlementFunctional.minus(originalFunctional)
    : originalFunctional.minus(settlementFunctional);

  const lines: SourceLine[] = isDebitControl
    ? [
        { code: cashOrOffsetCode, currency, debit: amount, credit: 0, fxRate: settlementFxRate },
        { code: control, currency, debit: 0, credit: amount, fxRate: originalFxRate },
      ]
    : [
        { code: control, currency, debit: amount, credit: 0, fxRate: originalFxRate },
        { code: cashOrOffsetCode, currency, debit: 0, credit: amount, fxRate: settlementFxRate },
      ];

  const functionalEntryLines: { code: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[] = isDebitControl
    ? [
        { code: cashOrOffsetCode, debit: settlementFunctional, credit: ZERO },
        { code: control, debit: ZERO, credit: originalFunctional },
      ]
    : [
        { code: control, debit: originalFunctional, credit: ZERO },
        { code: cashOrOffsetCode, debit: ZERO, credit: settlementFunctional },
      ];

  if (!fxDifference.eq(0)) {
    const absDiff = fxDifference.abs();
    if (fxDifference.gt(0)) {
      lines.push(
        { code: '1150', currency: functional, debit: absDiff, credit: 0, fxRate: null, memo: 'فرق صرف محقق' },
        { code: FX_GAIN_LOSS, currency: functional, debit: 0, credit: absDiff, fxRate: null, memo: 'ربح فرق صرف محقق' },
      );
      functionalEntryLines.push({ code: FX_GAIN_LOSS, debit: ZERO, credit: absDiff });
    } else {
      lines.push(
        { code: FX_GAIN_LOSS, currency: functional, debit: absDiff, credit: 0, fxRate: null, memo: 'خسارة فرق صرف محققة' },
        { code: '1150', currency: functional, debit: 0, credit: absDiff, fxRate: null, memo: 'فرق صرف محقق' },
      );
      functionalEntryLines.push({ code: FX_GAIN_LOSS, debit: absDiff, credit: ZERO });
    }
  }

  return {
    fxDifference,
    originalFunctional,
    settlementFunctional,
    lines,
    functionalEntryLines,
  };
}

export function controlTotals(items: ItemAmount[]) {
  const sum = (kind: OpenItemKind) =>
    items.filter((item) => item.kind === kind).reduce((total, item) => total.plus(item.amount), ZERO);
  return {
    receivables: sum(OpenItemKind.RECEIVABLE),
    payables: sum(OpenItemKind.PAYABLE),
    supplierAdvances: sum(OpenItemKind.ADVANCE_IN),
    customerAdvances: sum(OpenItemKind.ADVANCE_OUT),
    custody: sum(OpenItemKind.CUSTODY),
  };
}

export function nearMoney(left: Prisma.Decimal, right: Prisma.Decimal | number) {
  return left.minus(right).abs().lt('0.01');
}

export async function insertOpenItem(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    party: OpenItemParty;
    customerId?: string | null;
    supplierId?: string | null;
    borrowerId?: string | null;
    locationId?: string | null;
    employeeId?: string | null;
    partyName: string;
    kind: OpenItemKind;
    documentDate: Date;
    dueDate?: Date | null;
    currency: Currency;
    fxRate?: Prisma.Decimal | null;
    amount: Prisma.Decimal;
    settlementMode: SettlementMode;
    sourceType: string;
    sourceId?: string;
    reference?: string;
    memo?: string;
  },
) {
  if (input.amount.lte(0)) throw new BadRequestException('AMOUNT_INVALID');
  return tx.openItem.create({
    data: {
      companyId: input.companyId,
      party: input.party,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      borrowerId: input.borrowerId ?? null,
      locationId: input.locationId ?? null,
      employeeId: input.employeeId ?? null,
      partyName: input.partyName,
      kind: input.kind,
      documentDate: input.documentDate,
      dueDate: input.dueDate ?? input.documentDate,
      currency: input.currency,
      fxRate: input.fxRate ?? null,
      originalAmount: input.amount,
      remaining: input.amount,
      settlementMode: input.settlementMode,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? '',
      reference: input.reference ?? '',
      memo: input.memo ?? '',
      status: OpenItemStatus.OPEN,
    },
  });
}

async function reduceRemaining(tx: Prisma.TransactionClient, companyId: string, id: string, amount: Prisma.Decimal) {
  const item = await tx.openItem.findFirst({ where: { id, companyId } });
  if (!item) throw new BadRequestException('OPEN_ITEM_NOT_FOUND');
  if (amount.gt(item.remaining)) throw new BadRequestException('OVER_ALLOCATE');
  const remaining = item.remaining.minus(amount);
  await tx.openItem.update({
    where: { companyId_id: { companyId, id } },
    data: { remaining, status: remaining.eq(0) ? OpenItemStatus.CLOSED : OpenItemStatus.OPEN },
  });
}

export async function allocateItem(
  tx: Prisma.TransactionClient,
  companyId: string,
  openItemId: string,
  amount: Prisma.Decimal,
  source: {
    sourceType: string;
    sourceId: string;
    memo?: string;
    settlementFxRate?: Prisma.Decimal | null;
    fxDifference?: Prisma.Decimal;
  },
) {
  if (amount.lte(0)) throw new BadRequestException('AMOUNT_INVALID');
  await tx.openItemAllocation.create({
    data: {
      companyId,
      openItemId,
      amount,
      settlementFxRate: source.settlementFxRate ?? null,
      fxDifference: source.fxDifference ?? ZERO,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      memo: source.memo ?? '',
    },
  });
  await reduceRemaining(tx, companyId, openItemId, amount);
}

export async function reverseAllocations(
  tx: Prisma.TransactionClient,
  companyId: string,
  sourceType: string,
  sourceId: string,
) {
  const rows = await tx.openItemAllocation.findMany({
    where: { companyId, sourceType, sourceId },
  });
  for (const row of rows) {
    const item = await tx.openItem.findFirst({ where: { id: row.openItemId, companyId } });
    if (item) {
      const remaining = item.remaining.plus(row.amount);
      await tx.openItem.update({
        where: { companyId_id: { companyId, id: item.id } },
        data: {
          remaining,
          status: remaining.eq(0) ? OpenItemStatus.CLOSED : OpenItemStatus.OPEN,
        },
      });
    }
    await tx.openItemAllocation.delete({ where: { companyId_id: { companyId, id: row.id } } });
  }
}

export async function applyAdvance(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actorId: string;
    locationId?: string | null;
    transactionDate: Date;
    advanceItemId: string;
    targetItemId: string;
  },
) {
  const advance = await tx.openItem.findFirst({
    where: { id: input.advanceItemId, companyId: input.companyId },
  });
  const target = await tx.openItem.findFirst({
    where: { id: input.targetItemId, companyId: input.companyId },
  });
  if (!advance || !target) throw new BadRequestException('OPEN_ITEM_NOT_FOUND');
  if (advance.status !== OpenItemStatus.OPEN || target.status !== OpenItemStatus.OPEN) {
    throw new BadRequestException('OPEN_ITEM_CLOSED');
  }
  const customerAdvance =
    advance.kind === OpenItemKind.ADVANCE_OUT &&
    target.kind === OpenItemKind.RECEIVABLE &&
    advance.customerId === target.customerId;
  const supplierAdvance =
    advance.kind === OpenItemKind.ADVANCE_IN &&
    target.kind === OpenItemKind.PAYABLE &&
    advance.supplierId === target.supplierId;
  if (!customerAdvance && !supplierAdvance) throw new BadRequestException('ADVANCE_MISMATCH');
  if (advance.currency !== target.currency) throw new BadRequestException('CURRENCY_MISMATCH');
  const amount = Prisma.Decimal.min(advance.remaining, target.remaining);
  if (amount.lte(0)) throw new BadRequestException('AMOUNT_INVALID');
  const functional = await functionalCurrency(tx, input.companyId);
  const settlementFxRate = advance.fxRate ?? target.fxRate;
  const fx = buildSettlementFxJournal({
    kind: target.kind,
    currency: target.currency,
    functional,
    amount,
    originalFxRate: target.fxRate,
    settlementFxRate,
    cashOrOffsetCode: customerAdvance ? '2150' : '1250',
    controlCode: customerAdvance ? '1200' : '2100',
  });
  const allocation = await tx.openItemAllocation.create({
    data: {
      companyId: input.companyId,
      openItemId: advance.id,
      amount,
      settlementFxRate: target.fxRate ?? null,
      fxDifference: fx.fxDifference.neg(),
      sourceType: 'APPLY',
      sourceId: target.id,
      memo: 'تطبيق سلفة',
    },
  });
  await tx.openItemAllocation.create({
    data: {
      companyId: input.companyId,
      openItemId: target.id,
      amount,
      settlementFxRate: settlementFxRate ?? null,
      fxDifference: fx.fxDifference,
      sourceType: 'APPLY',
      sourceId: advance.id,
      memo: 'تطبيق سلفة',
    },
  });
  await reduceRemaining(tx, input.companyId, advance.id, amount);
  await reduceRemaining(tx, input.companyId, target.id, amount);
  await postOperationJournal(tx, {
    companyId: input.companyId,
    actorId: input.actorId,
    locationId: input.locationId,
    transactionDate: input.transactionDate,
    description: `تطبيق سلفة ${advance.partyName}`,
    sourceType: 'ADVANCE_APPLY',
    sourceId: allocation.id,
    lines: fx.lines,
  });
  return amount;
}

export async function appliedBySource(
  db: { openItem: Prisma.TransactionClient['openItem'] },
  companyId: string,
  sourceType: string,
  sourceIds: string[],
) {
  const map = new Map<string, Prisma.Decimal>();
  if (!sourceIds.length) return map;
  const rows = await db.openItem.findMany({
    where: { companyId, sourceType, sourceId: { in: sourceIds } },
    select: {
      sourceId: true,
      allocations: { where: { sourceType: 'APPLY' }, select: { amount: true } },
    },
  });
  for (const row of rows) {
    map.set(
      row.sourceId,
      row.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), ZERO),
    );
  }
  return map;
}

export function openingControlLines(
  items: { kind: OpenItemKind; currency: Currency; amount: Prisma.Decimal; fxRate: Prisma.Decimal | null; memo: string }[],
  allowance: Prisma.Decimal,
  functional: Currency,
) {
  const lines: {
    code: string;
    currency: Currency;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    fxRate: Prisma.Decimal | null;
    memo: string;
  }[] = [];
  for (const item of items) {
    const debitSide = DEBIT_KIND.has(item.kind);
    lines.push({
      code: CONTROL_ACCOUNT[item.kind],
      currency: item.currency,
      debit: debitSide ? item.amount : ZERO,
      credit: debitSide ? ZERO : item.amount,
      fxRate: item.fxRate,
      memo: item.memo,
    });
  }
  if (allowance.gt(0)) {
    lines.push({
      code: '1210',
      currency: functional,
      debit: ZERO,
      credit: allowance,
      fxRate: null,
      memo: 'مخصص الديون الافتتاحي',
    });
  }
  return lines;
}

export type RevalueKind = 'RECEIVABLE' | 'PAYABLE' | 'ADVANCE_IN' | 'ADVANCE_OUT' | 'CUSTODY';

export function isMonetaryOpenItem(kind: RevalueKind, settlementMode: 'CASH' | 'GOODS') {
  if (settlementMode === 'GOODS') return false;
  return (
    kind === 'RECEIVABLE' ||
    kind === 'PAYABLE' ||
    kind === 'ADVANCE_IN' ||
    kind === 'ADVANCE_OUT' ||
    kind === 'CUSTODY'
  );
}
