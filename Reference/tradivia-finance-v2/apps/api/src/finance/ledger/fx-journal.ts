import { BadRequestException } from '@nestjs/common';
import { Currency, JournalStatus, Prisma } from '@prisma/client';

type ExchangeRow = {
  paidCurrency: Currency;
  receivedCurrency: Currency;
  exchangeAmount: Prisma.Decimal;
  total: Prisma.Decimal;
};

type Position = { qty: Prisma.Decimal; cost: Prisma.Decimal };

const ZERO = new Prisma.Decimal(0);

type FxLine = { code: string; currency: Currency; debit: number; credit: number };

/**
 * Each currency book has to balance on its own.
 * A long position is foreign quantity carried at functional cost (Dr 1150 / Cr 1160).
 * Selling more than that quantity, or selling with no position, opens a short
 * (Dr 1160 / Cr 1150) so the cash legs still have a same-currency offset.
 * Covering a short recognizes the functional gain or loss, then any remainder becomes a long.
 */
export function applyExchange(functional: Currency, position: Position, row: ExchangeRow) {
  const foreign = functional === Currency.USD ? Currency.SYP : Currency.USD;
  const acquiring = row.receivedCurrency === foreign;
  const disposing = row.paidCurrency === foreign;
  const lines: FxLine[] = [];
  const next = { qty: position.qty, cost: position.cost };
  if (!acquiring && !disposing) return { lines, position: next, balanced: false };

  if (acquiring) {
    coverShortThenAddLong(lines, next, functional, foreign, amountOf(row, foreign), amountOf(row, functional));
  } else {
    relieveLongThenOpenShort(lines, next, functional, foreign, amountOf(row, foreign), amountOf(row, functional));
  }
  return { lines, position: next, balanced: true };
}

function amountOf(row: ExchangeRow, currency: Currency) {
  if (row.paidCurrency === currency) return row.exchangeAmount;
  if (row.receivedCurrency === currency) return row.total;
  return ZERO;
}

function pushLine(lines: FxLine[], code: string, currency: Currency, debit: Prisma.Decimal, credit: Prisma.Decimal) {
  const roundedDebit = roundFunctional(currency, debit);
  const roundedCredit = roundFunctional(currency, credit);
  if (roundedDebit.eq(0) && roundedCredit.eq(0)) return;
  lines.push({ code, currency, debit: roundedDebit.toNumber(), credit: roundedCredit.toNumber() });
}

function splitMoney(currency: Currency, total: Prisma.Decimal, first: Prisma.Decimal) {
  const head = roundFunctional(currency, first);
  const rest = roundFunctional(currency, total.minus(head));
  return { head, rest };
}

function coverShortThenAddLong(
  lines: FxLine[],
  next: Position,
  functional: Currency,
  foreign: Currency,
  qtyIn: Prisma.Decimal,
  costIn: Prisma.Decimal,
) {
  let qtyLeft = qtyIn;
  let costLeft = costIn;
  if (next.qty.lt(0) && qtyLeft.gt(0)) {
    const cover = Prisma.Decimal.min(qtyLeft, next.qty.abs());
    const carrying = cover.eq(next.qty.abs())
      ? next.cost.abs()
      : roundFunctional(functional, cover.mul(next.cost.div(next.qty)));
    const closeCost = cover.eq(qtyLeft) ? costLeft : splitMoney(functional, costLeft, costLeft.mul(cover).div(qtyLeft)).head;
    const gain = roundFunctional(functional, carrying.minus(closeCost));
    pushLine(lines, '1150', functional, carrying, ZERO);
    pushLine(lines, '1160', foreign, ZERO, cover);
    if (gain.gt(0)) pushLine(lines, '4200', functional, ZERO, gain);
    if (gain.lt(0)) pushLine(lines, '5300', functional, gain.abs(), ZERO);
    next.qty = next.qty.plus(cover);
    next.cost = next.cost.plus(carrying);
    if (next.qty.eq(0)) next.cost = ZERO;
    qtyLeft = qtyLeft.minus(cover);
    costLeft = roundFunctional(functional, costLeft.minus(closeCost));
  }
  if (qtyLeft.gt(0)) {
    pushLine(lines, '1150', functional, costLeft, ZERO);
    pushLine(lines, '1160', foreign, ZERO, qtyLeft);
    next.qty = next.qty.plus(qtyLeft);
    next.cost = next.cost.plus(costLeft);
  }
}

function relieveLongThenOpenShort(
  lines: FxLine[],
  next: Position,
  functional: Currency,
  foreign: Currency,
  qtyOut: Prisma.Decimal,
  proceeds: Prisma.Decimal,
) {
  let qtyLeft = qtyOut;
  let proceedsLeft = proceeds;
  if (next.qty.gt(0) && qtyLeft.gt(0)) {
    const tracked = Prisma.Decimal.min(qtyLeft, next.qty);
    const costOut = tracked.eq(next.qty)
      ? next.cost
      : roundFunctional(functional, tracked.mul(next.cost.div(next.qty)));
    const proceedsTracked = tracked.eq(qtyLeft)
      ? proceedsLeft
      : splitMoney(functional, proceedsLeft, proceedsLeft.mul(tracked).div(qtyLeft)).head;
    const gain = roundFunctional(functional, proceedsTracked.minus(costOut));
    pushLine(lines, '1150', functional, ZERO, costOut);
    pushLine(lines, '1160', foreign, tracked, ZERO);
    if (gain.gt(0)) pushLine(lines, '4200', functional, ZERO, gain);
    if (gain.lt(0)) pushLine(lines, '5300', functional, gain.abs(), ZERO);
    next.qty = next.qty.minus(tracked);
    next.cost = next.cost.minus(costOut);
    if (next.qty.lte(0)) {
      next.qty = ZERO;
      next.cost = ZERO;
    }
    qtyLeft = qtyLeft.minus(tracked);
    proceedsLeft = roundFunctional(functional, proceedsLeft.minus(proceedsTracked));
  }
  if (qtyLeft.gt(0)) {
    pushLine(lines, '1160', foreign, qtyLeft, ZERO);
    pushLine(lines, '1150', functional, ZERO, proceedsLeft);
    next.qty = next.qty.minus(qtyLeft);
    next.cost = next.cost.minus(proceedsLeft);
  }
}

/** Closing value of a foreign quantity. Rate is Syrian pounds per one dollar. */
export function revaluePosition(functional: Currency, qty: Prisma.Decimal, cost: Prisma.Decimal, rate: Prisma.Decimal) {
  if (qty.eq(0) || rate.lte(0)) return null;
  const raw = functional === Currency.USD ? qty.div(rate) : qty.mul(rate);
  const closing = roundFunctional(functional, raw);
  const carrying = roundFunctional(functional, cost);
  const gain = closing.minus(carrying);
  if (gain.eq(0)) return null;
  return { closing, carrying, gain };
}

function roundFunctional(currency: Currency, value: Prisma.Decimal) {
  const places = currency === Currency.SYP ? 0 : 2;
  return value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);
}

export async function foreignOperationRate(
  tx: Prisma.TransactionClient,
  companyId: string,
  currency: Currency,
  rate?: number,
) {
  const functional = await functionalCurrency(tx, companyId);
  if (currency === functional) return null;
  if (!(rate && rate > 0)) throw new BadRequestException('FX_RATE_REQUIRED');
  return new Prisma.Decimal(rate);
}

export async function functionalCurrency(tx: Prisma.TransactionClient, companyId: string) {
  const policy = await tx.accountingPolicy.findUnique({ where: { companyId }, select: { functionalCurrency: true } });
  return policy?.functionalCurrency ?? Currency.USD;
}

type PositionExclude = { exchangeId?: string; advanceId?: string };

export async function buildExchangeJournal(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actorId: string;
    fundCode: string;
    row: ExchangeRow & { id: string; reference: string; transactionDate: Date; locationId: string | null; exchangeRate: Prisma.Decimal };
    sourceType?: string;
    description?: string;
    projectId?: string | null;
    exclude?: string | PositionExclude;
  },
) {
  const { functional, position } = await replayCurrencyPosition(
    tx,
    input.companyId,
    input.exclude ?? input.row.id,
    input.row.transactionDate,
  );
  const applied = applyExchange(functional, position, input.row);
  const code = input.fundCode;
  return {
    companyId: input.companyId,
    actorId: input.actorId,
    locationId: input.row.locationId,
    projectId: input.projectId ?? null,
    transactionDate: input.row.transactionDate,
    description: input.description ?? `تصريف ${input.row.reference}`,
    sourceType: input.sourceType ?? 'EXCHANGE',
    sourceId: input.row.id,
    exchange: false,
    lines: [
      { code, currency: input.row.receivedCurrency, debit: input.row.total, credit: 0 },
      { code, currency: input.row.paidCurrency, debit: 0, credit: input.row.exchangeAmount },
      ...applied.lines,
    ].map((line) => ({
      ...line,
      fxRate: line.currency === functional ? null : input.row.exchangeRate,
    })),
  };
}

function positionExclude(exclude?: string | PositionExclude) {
  if (!exclude) return {};
  if (typeof exclude === 'string') return { exchangeId: exclude };
  return exclude;
}

export async function replayCurrencyPosition(
  tx: Prisma.TransactionClient,
  companyId: string,
  excludeId?: string | PositionExclude,
  asOf?: Date,
) {
  const functional = await functionalCurrency(tx, companyId);
  const foreign = functional === Currency.USD ? Currency.SYP : Currency.USD;
  const exclude = positionExclude(excludeId);
  const skipped: Prisma.JournalEntryWhereInput[] = [];
  if (exclude.exchangeId) skipped.push({ sourceType: 'EXCHANGE', sourceId: exclude.exchangeId });
  if (exclude.advanceId) skipped.push({ sourceType: 'ADVANCE', sourceId: exclude.advanceId });
  const lines = await tx.journalLine.findMany({
    where: {
      account: { code: { in: ['1150', '1160'] } },
      entry: {
        companyId,
        status: JournalStatus.POSTED,
        ...(asOf ? { transactionDate: { lte: asOf } } : {}),
        ...(skipped.length ? { NOT: { OR: skipped } } : {}),
      },
    },
    select: {
      debit: true,
      credit: true,
      currency: true,
      account: { select: { code: true } },
    },
  });
  let qty = ZERO;
  let cost = ZERO;
  for (const line of lines) {
    if (line.account.code === '1160' && line.currency === foreign) qty = qty.plus(line.credit).minus(line.debit);
    if (line.account.code === '1150' && line.currency === functional) cost = cost.plus(line.debit).minus(line.credit);
  }
  return { functional, position: { qty, cost } };
}
