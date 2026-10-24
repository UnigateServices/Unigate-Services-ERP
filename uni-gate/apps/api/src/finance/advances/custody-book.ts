import { BadRequestException } from '@nestjs/common';
import { AdvanceType, Currency, OpenItemKind, OpenItemParty, OpenItemStatus, Prisma, SettlementMode } from '@prisma/client';
import { functionalCurrency } from '../ledger/fx-journal';
import { allocateItem, buildSettlementFxJournal, insertOpenItem, reverseAllocations } from '../open-items/open-item-book';

/**
 * Borrower custody sub-ledger.
 *
 * Control account 1300 is the total. The detail lives in OpenItem rows of kind CUSTODY, one per cash hand-over
 * (ISSUE) or per currency conversion (EXCHANGE). Spending, returning and converting consume the oldest items first.
 * Cash funds are touched only by the ISSUE and RETURN vouchers, through their journal entry, never by this book.
 */

export const CUSTODY_SOURCE = 'ADVANCE';

export type CustodyAdvance = {
  id: string;
  reference: string;
  transactionDate: Date;
  borrowerId: string;
  advanceType: AdvanceType;
  currency: Currency;
  amount: Prisma.Decimal;
  total: Prisma.Decimal;
  fromCurrency: Currency | null;
  toCurrency: Currency | null;
  exchangeRate: Prisma.Decimal | null;
  locationId: string | null;
  employeeId: string;
};

type Slice = { id: string; remaining: Prisma.Decimal };

/** First-in first-out pick. Returns null when the open items cannot cover the amount. */
export function pickCustody(items: Slice[], amount: Prisma.Decimal) {
  let need = amount;
  const picks: { id: string; amount: Prisma.Decimal }[] = [];
  for (const item of items) {
    if (need.lte(0)) break;
    if (item.remaining.lte(0)) continue;
    const take = Prisma.Decimal.min(item.remaining, need);
    picks.push({ id: item.id, amount: take });
    need = need.minus(take);
  }
  return need.gt(0) ? null : picks;
}

export function custodyLegs(row: Pick<CustodyAdvance, 'advanceType' | 'currency' | 'total' | 'amount' | 'fromCurrency' | 'toCurrency'>) {
  switch (row.advanceType) {
    case AdvanceType.ISSUE:
      return { open: { currency: row.currency, amount: row.total } };
    case AdvanceType.RETURN:
    case AdvanceType.OUTCOME:
      return { use: { currency: row.currency, amount: row.total } };
    case AdvanceType.EXCHANGE:
      return {
        use: { currency: row.fromCurrency ?? row.currency, amount: row.amount },
        open: { currency: row.toCurrency ?? row.currency, amount: row.total },
      };
  }
}

export async function custodyBalance(
  tx: Pick<Prisma.TransactionClient, 'openItem'>,
  companyId: string,
  borrowerId: string,
  currency: Currency,
) {
  const rows = await tx.openItem.findMany({
    where: { companyId, borrowerId, kind: OpenItemKind.CUSTODY, currency, status: OpenItemStatus.OPEN },
    select: { remaining: true },
  });
  return rows.reduce((sum, row) => sum.plus(row.remaining), new Prisma.Decimal(0));
}

export async function consumeCustody(
  tx: Prisma.TransactionClient,
  companyId: string,
  borrowerId: string,
  currency: Currency,
  amount: Prisma.Decimal,
  advanceId: string,
  settlementFxRate?: Prisma.Decimal | null,
) {
  const items = await tx.openItem.findMany({
    where: {
      companyId,
      borrowerId,
      kind: OpenItemKind.CUSTODY,
      currency,
      status: OpenItemStatus.OPEN,
      remaining: { gt: 0 },
    },
    orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, remaining: true, fxRate: true },
  });
  const picks = pickCustody(items, amount);
  if (!picks) throw new BadRequestException('INSUFFICIENT_CUSTODY');
  const functional = await functionalCurrency(tx, companyId);
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const pick of picks) {
    const item = byId.get(pick.id)!;
    const fx = buildSettlementFxJournal({
      kind: OpenItemKind.CUSTODY,
      currency,
      functional,
      amount: pick.amount,
      originalFxRate: item.fxRate,
      settlementFxRate: settlementFxRate ?? null,
      cashOrOffsetCode: '5200',
    });
    await allocateItem(tx, companyId, pick.id, pick.amount, {
      sourceType: CUSTODY_SOURCE,
      sourceId: advanceId,
      memo: 'استهلاك عهدة',
      settlementFxRate: settlementFxRate ?? null,
      fxDifference: fx.fxDifference,
    });
  }
}

async function openCustody(
  tx: Prisma.TransactionClient,
  companyId: string,
  row: CustodyAdvance,
  borrowerName: string,
  leg: { currency: Currency; amount: Prisma.Decimal },
) {
  return insertOpenItem(tx, {
    companyId,
    party: OpenItemParty.BORROWER,
    borrowerId: row.borrowerId,
    locationId: row.locationId,
    employeeId: row.employeeId,
    partyName: borrowerName,
    kind: OpenItemKind.CUSTODY,
    documentDate: row.transactionDate,
    currency: leg.currency,
    fxRate: row.exchangeRate,
    amount: leg.amount,
    settlementMode: SettlementMode.CASH,
    sourceType: CUSTODY_SOURCE,
    sourceId: row.id,
    reference: row.reference,
    memo: row.advanceType === AdvanceType.EXCHANGE ? 'تصريف داخل العهدة' : 'صرف عهدة',
  });
}

/** Undo what an advance did to the sub-ledger. Refuses when its custody was already spent by another advance. */
export async function releaseCustody(tx: Prisma.TransactionClient, companyId: string, advanceId: string) {
  await reverseAllocations(tx, companyId, CUSTODY_SOURCE, advanceId);
  const created = await tx.openItem.findMany({
    where: { companyId, kind: OpenItemKind.CUSTODY, sourceType: CUSTODY_SOURCE, sourceId: advanceId },
    select: { id: true, remaining: true, originalAmount: true },
  });
  for (const item of created) {
    if (!item.remaining.eq(item.originalAmount)) throw new BadRequestException('CUSTODY_IN_USE');
  }
  if (created.length) await tx.openItem.deleteMany({ where: { companyId, id: { in: created.map((item) => item.id) } } });
}

export async function applyCustody(tx: Prisma.TransactionClient, companyId: string, row: CustodyAdvance) {
  const legs = custodyLegs(row);
  if (legs.use) await consumeCustody(tx, companyId, row.borrowerId, legs.use.currency, legs.use.amount, row.id, row.exchangeRate);
  if (legs.open) {
    const borrower = await tx.borrower.findFirstOrThrow({
      where: { id: row.borrowerId, companyId },
      select: { name: true },
    });
    await openCustody(tx, companyId, row, borrower.name, legs.open);
  }
}

export async function syncCustody(tx: Prisma.TransactionClient, companyId: string, row: CustodyAdvance) {
  await releaseCustody(tx, companyId, row.id);
  await applyCustody(tx, companyId, row);
}
