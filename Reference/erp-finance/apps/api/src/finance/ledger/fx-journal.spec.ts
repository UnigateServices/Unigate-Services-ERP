import assert from 'node:assert/strict';
import { Currency, OpenItemKind, Prisma } from '@prisma/client';
import { FX_GAIN_LOSS, SYSTEM_CHART } from './chart';
import { revaluePosition } from './fx-journal';
import { unbalancedCurrencies } from './journal-math';
import { buildSettlementFxJournal } from '../open-items/open-item-book';
import { RateService } from '../policy/rate.service';

const D = (value: number | string) => new Prisma.Decimal(value);

// 1. Existing FX position revaluation checks
const long = revaluePosition(Currency.USD, D(320000), D(20), D(20000));
assert.equal(long?.closing.toFixed(2), '16.00');
assert.equal(long?.gain.toFixed(2), '-4.00');

const flat = revaluePosition(Currency.USD, D(0), D(-1), D(20000));
assert.equal(flat, null);

const short = revaluePosition(Currency.USD, D(-15000), D(-1), D(20000));
assert.equal(short?.closing.toFixed(2), '-0.75');
assert.equal(short?.gain.toFixed(2), '0.25');

// 2. Chart of accounts check: FX_GAIN_LOSS exists and is distinct from unrealized translation accounts (4210 / 5310)
const fxAccount = SYSTEM_CHART.find((row) => row.code === FX_GAIN_LOSS);
assert.ok(fxAccount, 'FX_GAIN_LOSS account must exist in SYSTEM_CHART');
assert.notEqual(FX_GAIN_LOSS, '4210');
assert.notEqual(FX_GAIN_LOSS, '5310');

// 3. Full settlement test:
// Invoice of $100 at 13,000 SYP/USD (1,300,000 SYP) settled at 14,500 SYP/USD (1,450,000 SYP)
// -> generates 150,000 SYP realized FX gain with a balanced journal entry.
{
  const full = buildSettlementFxJournal({
    kind: OpenItemKind.RECEIVABLE,
    currency: Currency.USD,
    functional: Currency.SYP,
    amount: D(100),
    originalFxRate: D(13000),
    settlementFxRate: D(14500),
    cashOrOffsetCode: '1110',
    controlCode: '1200',
  });

  assert.equal(full.originalFunctional.toFixed(0), '1300000');
  assert.equal(full.settlementFunctional.toFixed(0), '1450000');
  assert.equal(full.fxDifference.toFixed(0), '150000');

  // Verify functional view entry: Cash Dr 1,450,000 / Receivable Cr 1,300,000 / FX_GAIN_LOSS Cr 150,000
  const totalFunctionalDebit = full.functionalEntryLines.reduce((sum, l) => sum.plus(l.debit), D(0));
  const totalFunctionalCredit = full.functionalEntryLines.reduce((sum, l) => sum.plus(l.credit), D(0));
  assert.equal(totalFunctionalDebit.toFixed(0), '1450000');
  assert.equal(totalFunctionalCredit.toFixed(0), '1450000');
  assert.equal(totalFunctionalDebit.eq(totalFunctionalCredit), true, 'Functional entry must be balanced');

  // Verify multi-currency ledger lines are balanced per currency and hit FX_GAIN_LOSS with 150,000 SYP
  const bad = unbalancedCurrencies(
    full.lines.map((line) => ({
      currency: line.currency,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  );
  assert.deepEqual(bad, [], 'Multi-currency journal entry must be balanced in every currency');

  const fxLine = full.lines.find((line) => line.code === FX_GAIN_LOSS);
  assert.ok(fxLine, 'Journal must include FX_GAIN_LOSS line');
  assert.equal(fxLine.currency, Currency.SYP);
  assert.equal(Number(fxLine.credit), 150000);
  assert.equal(Number(fxLine.debit), 0);
}

// 4. Partial settlement test:
// Invoice of $100 at 13,000 SYP/USD:
// - First partial payment of $40 at 14,500 SYP/USD -> realized FX gain = 40 * (14,500 - 13,000) = 60,000 SYP
// - Second partial payment of $60 at 12,500 SYP/USD -> realized FX loss = 60 * (12,500 - 13,000) = -30,000 SYP
{
  const part1 = buildSettlementFxJournal({
    kind: OpenItemKind.RECEIVABLE,
    currency: Currency.USD,
    functional: Currency.SYP,
    amount: D(40),
    originalFxRate: D(13000),
    settlementFxRate: D(14500),
    cashOrOffsetCode: '1110',
    controlCode: '1200',
  });
  assert.equal(part1.originalFunctional.toFixed(0), '520000');
  assert.equal(part1.settlementFunctional.toFixed(0), '580000');
  assert.equal(part1.fxDifference.toFixed(0), '60000');
  assert.deepEqual(
    unbalancedCurrencies(
      part1.lines.map((line) => ({
        currency: line.currency,
        debit: Number(line.debit),
        credit: Number(line.credit),
      })),
    ),
    [],
  );

  const part2 = buildSettlementFxJournal({
    kind: OpenItemKind.RECEIVABLE,
    currency: Currency.USD,
    functional: Currency.SYP,
    amount: D(60),
    originalFxRate: D(13000),
    settlementFxRate: D(12500),
    cashOrOffsetCode: '1110',
    controlCode: '1200',
  });
  assert.equal(part2.originalFunctional.toFixed(0), '780000');
  assert.equal(part2.settlementFunctional.toFixed(0), '750000');
  assert.equal(part2.fxDifference.toFixed(0), '-30000');
  assert.deepEqual(
    unbalancedCurrencies(
      part2.lines.map((line) => ({
        currency: line.currency,
        debit: Number(line.debit),
        credit: Number(line.credit),
      })),
    ),
    [],
  );
  const lossLine = part2.lines.find((line) => line.code === FX_GAIN_LOSS);
  assert.ok(lossLine);
  assert.equal(Number(lossLine.debit), 30000);
  assert.equal(Number(lossLine.credit), 0);
}

// 5. RateService.resolve check (latest rate <= document date, Arabic rejection when missing)
async function testRateService() {
  const mockRates = [
    { code: 'SYP', rateDate: new Date('2026-10-10T12:00:00.000Z'), rate: D(13000) },
    { code: 'SYP', rateDate: new Date('2026-10-14T12:00:00.000Z'), rate: D(14500) },
  ];
  const mockTx = {
    accountingPolicy: {
      findUnique: async () => ({ functionalCurrency: Currency.USD }),
    },
    companyCurrency: {
      findUnique: async () => ({ active: true }),
    },
    dailyRate: {
      findFirst: async ({ where }: { where: { code: string; rateDate: { lte: Date } } }) => {
        const candidates = mockRates
          .filter((r) => r.code === where.code && r.rateDate.getTime() <= where.rateDate.lte.getTime())
          .sort((a, b) => b.rateDate.getTime() - a.rateDate.getTime());
        return candidates[0] ? { rate: candidates[0].rate } : null;
      },
    },
  };

  const resolvedOn12th = await RateService.resolve(mockTx as never, 'tradivia', 'SYP', '2026-10-12');
  assert.equal(resolvedOn12th?.toFixed(0), '13000', 'Must resolve latest rate <= document date');

  const resolvedOn15th = await RateService.resolve(mockTx as never, 'tradivia', 'SYP', '2026-10-15');
  assert.equal(resolvedOn15th?.toFixed(0), '14500', 'Must resolve latest rate on 15th from 14th');

  await assert.rejects(
    () => RateService.resolve(mockTx as never, 'tradivia', 'SYP', '2026-10-01'),
    (err: { getResponse?: () => { message?: string } }) => {
      const msg = err.getResponse?.()?.message || '';
      return msg.includes('لا يوجد سعر صرف مسجل');
    },
    'Must reject with a clear Arabic error when no rate <= document date exists',
  );
}

testRateService().then(() => {
  console.log('fx engine & realized gain/loss checks passed');
});
