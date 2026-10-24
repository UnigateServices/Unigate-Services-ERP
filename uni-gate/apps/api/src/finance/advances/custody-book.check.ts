import assert from 'node:assert/strict';
import { AdvanceType, Currency, FundType, Prisma } from '@prisma/client';
import { operationJournalForAdvance } from '../ledger/post-source';
import { unbalancedCurrencies } from '../ledger/journal-math';
import { custodyLegs, pickCustody } from './custody-book';

const D = (value: number | string) => new Prisma.Decimal(value);

// FIFO consumption across several custody items.
{
  const picks = pickCustody(
    [
      { id: 'a', remaining: D(20) },
      { id: 'b', remaining: D(0) },
      { id: 'c', remaining: D(30) },
    ],
    D(35),
  );
  assert.deepEqual(
    picks?.map((pick) => [pick.id, pick.amount.toString()]),
    [
      ['a', '20'],
      ['c', '15'],
    ],
  );
}

// A spend the custody cannot cover is refused instead of driving a negative balance.
assert.equal(pickCustody([{ id: 'a', remaining: D(10) }], D(10.0001)), null);
assert.deepEqual(pickCustody([], D(0)), []);

const base = {
  currency: Currency.USD,
  total: D(50),
  amount: D(50),
  fromCurrency: null,
  toCurrency: null,
};

// What each voucher does to the sub-ledger.
assert.deepEqual(custodyLegs({ ...base, advanceType: AdvanceType.ISSUE }), { open: { currency: 'USD', amount: D(50) } });
assert.deepEqual(custodyLegs({ ...base, advanceType: AdvanceType.RETURN }), { use: { currency: 'USD', amount: D(50) } });
assert.deepEqual(custodyLegs({ ...base, advanceType: AdvanceType.OUTCOME }), { use: { currency: 'USD', amount: D(50) } });
const exchange = custodyLegs({
  ...base,
  advanceType: AdvanceType.EXCHANGE,
  currency: Currency.SYP,
  amount: D(15000),
  total: D(1),
  fromCurrency: Currency.SYP,
  toCurrency: Currency.USD,
});
assert.equal(exchange.use?.currency, 'SYP');
assert.equal(exchange.use?.amount.toString(), '15000');
assert.equal(exchange.open?.currency, 'USD');
assert.equal(exchange.open?.amount.toString(), '1');

// ISSUE and RETURN are the only advance journals that touch a cash account, and they stay balanced.
async function journal(advanceType: AdvanceType, fund: FundType | null) {
  return operationJournalForAdvance({} as never, 'tradivia', 'actor', {
    id: 'adv',
    reference: 'AD-1',
    transactionDate: new Date('2026-10-01T12:00:00.000Z'),
    locationId: null,
    projectId: null,
    advanceType,
    currency: Currency.USD,
    total: D(50),
    amount: D(50),
    fromCurrency: null,
    toCurrency: null,
    exchangeRate: null,
    fund,
  });
}

async function main() {
  const issue = await journal(AdvanceType.ISSUE, FundType.VAULT);
  assert.deepEqual(
    issue.lines.map((line) => [line.code, Number(line.debit), Number(line.credit)]),
    [
      ['1300', 50, 0],
      ['1110', 0, 50],
    ],
  );
  assert.equal(unbalancedCurrencies(issue.lines.map((l) => ({ currency: l.currency, debit: Number(l.debit), credit: Number(l.credit) }))).length, 0);

  const back = await journal(AdvanceType.RETURN, FundType.BANK);
  assert.deepEqual(
    back.lines.map((line) => [line.code, Number(line.debit), Number(line.credit)]),
    [
      ['1130', 50, 0],
      ['1300', 0, 50],
    ],
  );

  // A spend never touches a cash account.
  const spend = await journal(AdvanceType.OUTCOME, null);
  assert.deepEqual(
    spend.lines.map((line) => line.code),
    ['5200', '1300'],
  );

  await assert.rejects(() => journal(AdvanceType.ISSUE, null), /FUNDS_REQUIRED/);
  console.log('custody book checks passed');
}

main();
