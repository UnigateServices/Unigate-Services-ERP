'use client';

import { CURRENCIES, CurrencyCode, FundsSnapshot } from '../lib/api';

type Props = {
  funds: FundsSnapshot | null;
  section: string;
  layout?: 'board';
};

const VAULT_SECTIONS = new Set(['cash', 'income', 'outcome', 'exchange', 'transfer', 'opening', 'advances']);
const BANK_SECTIONS = new Set(['cash', 'income', 'outcome', 'exchange', 'transfer', 'advances']);
// Custody is a sub-ledger of current assets (account 1300), not a cash fund: it is shown only beside the custody vouchers.
const CUSTODY_SECTIONS = new Set(['advances']);

function currencyLabel(code: string) {
  return CURRENCIES.find((item) => item.value === code)?.label || code;
}

function money(amount: number, currency: string) {
  const digits = currency === 'SYP' ? 0 : 2;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function Amounts({ rows }: { rows: { currency: CurrencyCode; amount: number }[] }) {
  if (rows.length === 0) {
    return <p className="fund-empty">لا توجد عملات بعد</p>;
  }
  return (
    <div className="fund-currencies">
      {rows.map((row) => (
        <div key={row.currency} className="fund-currency-cell">
          <div className={`fund-currency-amount${row.amount < 0 ? ' is-negative' : ''}`}>
            {money(row.amount, row.currency)}
          </div>
          <div className="fund-currency-code">{currencyLabel(row.currency)}</div>
        </div>
      ))}
    </div>
  );
}

function NamedCards({
  rows,
  emptyText,
}: {
  rows: FundsSnapshot['banks'];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="fund-empty">{emptyText}</p>;
  }
  return (
    <div className="fund-named-grid">
      {rows.map((row) => (
        <div key={row.id} className="fund-named-cell">
          <div className="fund-named-title">{row.name}</div>
          <Amounts rows={row.balances} />
        </div>
      ))}
    </div>
  );
}

export function FundsBar({ funds, section, layout }: Props) {
  const showVault = VAULT_SECTIONS.has(section);
  const showBank = BANK_SECTIONS.has(section);
  const showCustody = CUSTODY_SECTIONS.has(section);
  if (!showVault && !showBank && !showCustody) return null;

  const snapshot: FundsSnapshot = funds || { vault: [], sham: [], banks: [], custody: [] };

  return (
    <div className={`balances-bar${layout === 'board' ? ' is-board' : ''}`}>
      {showVault ? (
        <>
          <article className="fund-card">
            <header className="fund-card-header">
              <strong>الخزنة</strong>
              <span>صندوق</span>
            </header>
            <Amounts rows={snapshot.vault} />
          </article>
          <article className="fund-card">
            <header className="fund-card-header">
              <strong>شام كاش</strong>
              <span>صندوق</span>
            </header>
            <Amounts rows={snapshot.sham} />
          </article>
        </>
      ) : null}
      {showBank ? (
        <article className="fund-card fund-card-wide">
          <header className="fund-card-header">
            <strong>البنوك</strong>
            <span>حسابات</span>
          </header>
          <NamedCards rows={snapshot.banks} emptyText="لا توجد حسابات بنكية بعد" />
        </article>
      ) : null}
      {showCustody ? (
        <article className="fund-card fund-card-wide">
          <header className="fund-card-header">
            <strong>عهد المستلفين</strong>
            <span>أصل متداول · حساب 1300</span>
          </header>
          <NamedCards rows={snapshot.custody} emptyText="لا توجد عهد قائمة" />
        </article>
      ) : null}
    </div>
  );
}
