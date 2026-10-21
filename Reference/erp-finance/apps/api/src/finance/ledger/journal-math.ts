export type JournalSide = {
  currency: string;
  debit: number;
  credit: number;
};

const SCALE = 10000;

export function moneyUnits(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * SCALE);
}

/** Each currency in the entry must balance on its own. An empty or one-sided currency is rejected. */
export function unbalancedCurrencies(lines: JournalSide[]) {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const debit = moneyUnits(line.debit);
    const credit = moneyUnits(line.credit);
    if (debit == null || credit == null) return ['INVALID'];
    if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) return ['INVALID'];
    const row = totals.get(line.currency) ?? { debit: 0, credit: 0 };
    row.debit += debit;
    row.credit += credit;
    totals.set(line.currency, row);
  }
  if (totals.size === 0) return ['EMPTY'];
  const bad: string[] = [];
  for (const [currency, row] of totals) {
    if (row.debit === 0 || row.credit === 0 || row.debit !== row.credit) bad.push(currency);
  }
  return bad;
}
