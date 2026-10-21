import { AccountType, Currency, Prisma } from '@prisma/client';

type MoneyBucket = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  line: string;
  currency: Currency;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

/** Rate is Syrian pounds per one dollar. Foreign lines are folded into the functional currency. */
export function translateToFunctional<T extends MoneyBucket>(buckets: T[], functional: Currency, rate: Prisma.Decimal): T[] {
  const map = new Map<string, T>();
  for (const row of buckets) {
    const debit = convertAmount(row.debit, row.currency, functional, rate);
    const credit = convertAmount(row.credit, row.currency, functional, rate);
    const current = map.get(row.accountId);
    if (!current) {
      map.set(row.accountId, { ...row, currency: functional, debit, credit });
      continue;
    }
    current.debit = current.debit.plus(debit);
    current.credit = current.credit.plus(credit);
  }
  return [...map.values()];
}

function isUsdSypPair(currency: Currency, functional: Currency) {
  const pair = new Set<Currency>([Currency.USD, Currency.SYP]);
  return pair.has(currency) && pair.has(functional);
}

function convertAmount(amount: Prisma.Decimal, currency: Currency, functional: Currency, rate: Prisma.Decimal) {
  if (currency === functional) return amount;
  if (rate.lte(0)) return amount;
  if (isUsdSypPair(currency, functional)) {
    if (functional === Currency.USD) return amount.div(rate);
    return amount.mul(rate);
  }
  return amount.div(rate);
}

const HISTORICAL = new Set<AccountType>([AccountType.INCOME, AccountType.EXPENSE, AccountType.EQUITY]);

export function usesHistoricalRate(type: AccountType, code: string) {
  return HISTORICAL.has(type) || code === '1400' || code === '1410' || code === '1250' || code === '2150';
}

type RatedLine = {
  currency: Currency;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  fxRate: Prisma.Decimal | null;
  account: { type: AccountType; code: string };
};

/** Income, expense, equity, and inventory keep the operation rate. Monetary balances use the closing rate. */
export function translatedLine(line: RatedLine, functional: Currency, closing: Prisma.Decimal) {
  if (line.currency === functional) return { debit: line.debit, credit: line.credit };
  const rate = usesHistoricalRate(line.account.type, line.account.code) && line.fxRate && line.fxRate.gt(0) ? line.fxRate : closing;
  return {
    debit: convertAmount(line.debit, line.currency, functional, rate),
    credit: convertAmount(line.credit, line.currency, functional, rate),
  };
}

/** Closing-rate movement minus historical-rate movement. IAS 7.28 uses this on cash. Zero when the line has no rate of its own. */
export function monetaryRateGap(line: RatedLine, functional: Currency, closing: Prisma.Decimal) {
  if (line.currency === functional || usesHistoricalRate(line.account.type, line.account.code)) return new Prisma.Decimal(0);
  const atClose = translatedLine(line, functional, closing);
  const rate = line.fxRate && line.fxRate.gt(0) ? line.fxRate : closing;
  const historical = convertAmount(line.debit.minus(line.credit), line.currency, functional, rate);
  return atClose.debit.minus(atClose.credit).minus(historical);
}
