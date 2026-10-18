import { AccountType, Currency, Prisma } from '@prisma/client';
import { STATEMENT_LINES } from './statement-lines';

const ZERO = new Prisma.Decimal(0);

/**
 * IAS 7 indirect method.
 * Inflow is positive. Translation gains and losses are removed from profit because they are not cash.
 * The foreign-currency position is investing, after stripping unrealised revaluation.
 * The rate effect on cash is presented on its own (IAS 7.28), not inside the three activities.
 * Unmapped assets are investing. Unmapped liabilities and equity are financing.
 */
export type CashFlowBucket = {
  code: string;
  name: string;
  type: AccountType;
  line: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

export type CashFlowLine = {
  code: string;
  name: string;
  amount: string;
};

export type IndirectCashFlow = {
  currency: Currency;
  method: 'INDIRECT';
  profit: string;
  adjustments: CashFlowLine[];
  workingCapital: CashFlowLine[];
  operating: string;
  investing: CashFlowLine[];
  investingTotal: string;
  financing: CashFlowLine[];
  financingTotal: string;
  fxOnCash: string;
  revaluationExcluded: string;
  netChange: string;
  cashMovement: string;
  difference: string;
  reconciled: boolean;
};

type FlowClass = 'CASH' | 'PROFIT' | 'NON_CASH' | 'OPERATING' | 'INVESTING' | 'FINANCING';

const LINE_CLASS: Record<string, FlowClass> = {
  CASH: 'CASH',
  RECEIVABLES: 'OPERATING',
  ADVANCES: 'OPERATING',
  INVENTORY: 'OPERATING',
  PAYABLES: 'OPERATING',
  FX_CLEARING: 'OPERATING',
  FX_POSITION: 'INVESTING',
  OTHER_ASSETS: 'INVESTING',
  PPE: 'INVESTING',
  INTANGIBLES: 'INVESTING',
  INVESTMENTS: 'INVESTING',
  CAPITAL: 'FINANCING',
  RETAINED: 'FINANCING',
  OTHER_EQUITY: 'FINANCING',
  OTHER_LIABILITIES: 'FINANCING',
  BORROWINGS: 'FINANCING',
  FX_TRANSLATION_GAIN: 'NON_CASH',
  FX_TRANSLATION_LOSS: 'NON_CASH',
};

const ORDER = [
  'FX_TRANSLATION_GAIN',
  'FX_TRANSLATION_LOSS',
  'RECEIVABLES',
  'ADVANCES',
  'INVENTORY',
  'PAYABLES',
  'FX_CLEARING',
  'FX_POSITION',
  'PPE',
  'INTANGIBLES',
  'INVESTMENTS',
  'OTHER_ASSETS',
  'CAPITAL',
  'BORROWINGS',
  'OTHER_LIABILITIES',
  'RETAINED',
  'OTHER_EQUITY',
];

export function cashFlowClass(line: string, type: AccountType): FlowClass {
  const known = LINE_CLASS[line];
  if (known) return known;
  if (type === AccountType.INCOME || type === AccountType.EXPENSE) return 'PROFIT';
  if (type === AccountType.ASSET) return 'INVESTING';
  if (type === AccountType.LIABILITY || type === AccountType.EQUITY) return 'FINANCING';
  return 'OPERATING';
}

export function cashFlowKey(line: string, accountCode: string) {
  return line || accountCode;
}

type Acc = { code: string; name: string; netDebit: Prisma.Decimal };

export function buildIndirectCashFlow(input: {
  currency: Currency;
  buckets: CashFlowBucket[];
  fxEffect?: Record<string, Prisma.Decimal>;
  revaluation?: Record<string, Prisma.Decimal>;
}): IndirectCashFlow {
  const fxEffect = input.fxEffect ?? {};
  const revaluation = input.revaluation ?? {};
  const groups: Record<FlowClass, Map<string, Acc>> = {
    CASH: new Map(),
    PROFIT: new Map(),
    NON_CASH: new Map(),
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };

  for (const row of input.buckets) {
    const key = cashFlowKey(row.line, row.code);
    const kind = cashFlowClass(key, row.type);
    add(groups[kind], key, lineTitle(key, row.name), row.debit.minus(row.credit));
  }

  const profit = cents(sumNet(groups.PROFIT).plus(sumNet(groups.NON_CASH)).neg());
  const adjustments = present(groups.NON_CASH, (net) => net);
  const workingCapital = present(groups.OPERATING, (net, code) => movement(net, fxEffect[code], revaluation[code]));
  const investing = present(groups.INVESTING, (net, code) => movement(net, fxEffect[code], revaluation[code]));
  const financing = present(groups.FINANCING, (net, code) => movement(net, fxEffect[code], revaluation[code]));
  const fxOnCash = cents(fxEffect.CASH ?? ZERO);
  const operating = profit.plus(adjustments.total).plus(workingCapital.total);
  const netChange = operating.plus(investing.total).plus(financing.total).plus(fxOnCash);
  const cashMovement = cents(sumNet(groups.CASH));
  const difference = cashMovement.minus(netChange);
  const revaluationExcluded = cents(Object.values(revaluation).reduce((sum, value) => sum.plus(value), ZERO));

  return {
    currency: input.currency,
    method: 'INDIRECT',
    profit: profit.toFixed(2),
    adjustments: adjustments.lines,
    workingCapital: workingCapital.lines,
    operating: operating.toFixed(2),
    investing: investing.lines,
    investingTotal: investing.total.toFixed(2),
    financing: financing.lines,
    financingTotal: financing.total.toFixed(2),
    fxOnCash: fxOnCash.toFixed(2),
    revaluationExcluded: revaluationExcluded.toFixed(2),
    netChange: netChange.toFixed(2),
    cashMovement: cashMovement.toFixed(2),
    difference: difference.toFixed(2),
    reconciled: difference.isZero(),
  };
}

function movement(netDebit: Prisma.Decimal, fx?: Prisma.Decimal, revaluation?: Prisma.Decimal) {
  return netDebit.minus(fx ?? ZERO).minus(revaluation ?? ZERO).neg();
}

function add(map: Map<string, Acc>, code: string, name: string, net: Prisma.Decimal) {
  const current = map.get(code);
  if (!current) {
    map.set(code, { code, name, netDebit: net });
    return;
  }
  current.netDebit = current.netDebit.plus(net);
}

function sumNet(map: Map<string, Acc>) {
  let total = ZERO;
  for (const row of map.values()) total = total.plus(row.netDebit);
  return total;
}

function present(map: Map<string, Acc>, effect: (netDebit: Prisma.Decimal, code: string) => Prisma.Decimal) {
  const rows = [...map.values()]
    .map((row) => ({ code: row.code, name: row.name, amount: cents(effect(row.netDebit, row.code)) }))
    .filter((row) => !row.amount.isZero())
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
  return {
    lines: rows.map((row) => ({ code: row.code, name: row.name, amount: row.amount.toFixed(2) })),
    total: rows.reduce((sum, row) => sum.plus(row.amount), ZERO),
  };
}

function lineTitle(code: string, fallback: string) {
  return STATEMENT_LINES.find((line) => line.code === code)?.name ?? fallback;
}

function rank(code: string) {
  const index = ORDER.indexOf(code);
  return index === -1 ? 500 : index;
}

function cents(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
