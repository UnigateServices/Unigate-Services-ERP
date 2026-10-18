import assert from 'node:assert/strict';
import { AccountType, Currency, Prisma } from '@prisma/client';
import { buildIndirectCashFlow, type CashFlowBucket } from './cash-flow';
import { monetaryRateGap, translatedLine } from './functional-view';

const D = (value: number | string) => new Prisma.Decimal(value);
const USD = Currency.USD;
const SYP = Currency.SYP;

function line(
  code: string,
  name: string,
  type: AccountType,
  statementLine: string,
  currency: Currency,
  debit: number,
  credit: number,
): CashFlowBucket {
  return { code, name, type, line: statementLine, debit: D(debit), credit: D(credit) };
}

function expectTied(book: ReturnType<typeof buildIndirectCashFlow>, cash: string) {
  assert.equal(book.reconciled, true, JSON.stringify(book));
  assert.equal(book.cashMovement, cash);
  assert.equal(book.difference, '0.00');
  const net = D(book.operating).plus(book.investingTotal).plus(book.financingTotal).plus(book.fxOnCash);
  assert.equal(net.toFixed(2), book.netChange);
  assert.equal(book.netChange, book.cashMovement);
}

const cashSale = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1110', 'الخزنة', AccountType.ASSET, 'CASH', USD, 100, 0),
    line('4100', 'المبيعات', AccountType.INCOME, 'SALES', USD, 0, 100),
  ],
});
expectTied(cashSale, '100.00');
assert.equal(cashSale.profit, '100.00');
assert.equal(cashSale.operating, '100.00');
assert.equal(cashSale.investingTotal, '0.00');
assert.equal(cashSale.financingTotal, '0.00');

const creditSale = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1200', 'ذمم الزبائن', AccountType.ASSET, 'RECEIVABLES', USD, 100, 0),
    line('4100', 'المبيعات', AccountType.INCOME, 'SALES', USD, 0, 100),
  ],
});
expectTied(creditSale, '0.00');
assert.equal(creditSale.operating, '0.00');
assert.equal(creditSale.workingCapital[0]?.amount, '-100.00');

const capital = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1110', 'الخزنة', AccountType.ASSET, 'CASH', USD, 200, 0),
    line('3100', 'رأس المال', AccountType.EQUITY, 'CAPITAL', USD, 0, 200),
  ],
});
expectTied(capital, '200.00');
assert.equal(capital.operating, '0.00');
assert.equal(capital.financingTotal, '200.00');

const revaluation = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1150', 'مركز عملات أجنبية', AccountType.ASSET, 'FX_POSITION', USD, 95, 0),
    line('1110', 'الخزنة', AccountType.ASSET, 'CASH', USD, 0, 80),
    line('4210', 'أرباح الترجمة', AccountType.INCOME, 'FX_TRANSLATION_GAIN', USD, 0, 15),
  ],
  revaluation: { FX_POSITION: D(15) },
});
expectTied(revaluation, '-80.00');
assert.equal(revaluation.profit, '15.00');
assert.equal(revaluation.operating, '0.00');
assert.equal(revaluation.investingTotal, '-80.00');
assert.equal(revaluation.adjustments[0]?.amount, '-15.00');

const positionOnly = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1150', 'مركز عملات أجنبية', AccountType.ASSET, 'FX_POSITION', USD, 15, 0),
    line('4210', 'أرباح الترجمة', AccountType.INCOME, 'FX_TRANSLATION_GAIN', USD, 0, 15),
  ],
  revaluation: { FX_POSITION: D(15) },
});
expectTied(positionOnly, '0.00');
assert.equal(positionOnly.investingTotal, '0.00');
assert.equal(positionOnly.operating, '0.00');

const equipment = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1500', 'معدات', AccountType.ASSET, 'OTHER_ASSETS', USD, 40, 0),
    line('1110', 'الخزنة', AccountType.ASSET, 'CASH', USD, 0, 40),
  ],
});
expectTied(equipment, '-40.00');
assert.equal(equipment.investingTotal, '-40.00');
assert.equal(equipment.operating, '0.00');

const closing = D(12500);
const historical = D(10000);
const foreignCash = {
  currency: SYP,
  debit: D(100000),
  credit: D(0),
  fxRate: historical,
  account: { type: AccountType.ASSET, code: '1110' },
};
const foreignSales = {
  currency: SYP,
  debit: D(0),
  credit: D(100000),
  fxRate: historical,
  account: { type: AccountType.INCOME, code: '4100' },
};
const cashTranslated = translatedLine(foreignCash, USD, closing);
const salesTranslated = translatedLine(foreignSales, USD, closing);
const fxOnCash = monetaryRateGap(foreignCash, USD, closing);
const translated = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1110', 'الخزنة', AccountType.ASSET, 'CASH', USD, Number(cashTranslated.debit), Number(cashTranslated.credit)),
    line('4100', 'المبيعات', AccountType.INCOME, 'SALES', USD, Number(salesTranslated.debit), Number(salesTranslated.credit)),
    line('5310', 'خسائر الترجمة', AccountType.EXPENSE, 'FX_TRANSLATION_LOSS', USD, 2, 0),
  ],
  fxEffect: { CASH: fxOnCash },
});
expectTied(translated, '8.00');
assert.equal(translated.profit, '8.00');
assert.equal(translated.operating, '10.00');
assert.equal(translated.fxOnCash, '-2.00');

const foreignReceivable = {
  currency: SYP,
  debit: D(100000),
  credit: D(0),
  fxRate: historical,
  account: { type: AccountType.ASSET, code: '1200' },
};
const receivableTranslated = translatedLine(foreignReceivable, USD, closing);
const receivableGap = monetaryRateGap(foreignReceivable, USD, closing);
const creditFx = buildIndirectCashFlow({
  currency: USD,
  buckets: [
    line('1200', 'ذمم الزبائن', AccountType.ASSET, 'RECEIVABLES', USD, Number(receivableTranslated.debit), 0),
    line('4100', 'المبيعات', AccountType.INCOME, 'SALES', USD, 0, Number(salesTranslated.credit)),
    line('5310', 'خسائر الترجمة', AccountType.EXPENSE, 'FX_TRANSLATION_LOSS', USD, 2, 0),
  ],
  fxEffect: { RECEIVABLES: receivableGap },
});
expectTied(creditFx, '0.00');
assert.equal(creditFx.operating, '0.00');
assert.equal(creditFx.fxOnCash, '0.00');

console.log('cash-flow IAS 7 checks passed');
