'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { DataTable, type Column } from './ui/data-table';
import { StatCard } from './ui/stat-card';
import {
  CurrencyBalance,
  FundsSnapshot,
  IncomeRow,
  OpenItemRow,
  OutcomeRow,
  PnlBook,
  getProfitAndLoss,
  listOpenItems,
} from '../lib/api';
import './enterprise.css';

type Props = {
  /** Pending approval requests waiting on the viewer. */
  pending?: number;
  funds: FundsSnapshot | null;
  incomes: IncomeRow[];
  outcomes: OutcomeRow[];
};

type Totals = Record<'USD' | 'SYP', number>;

function emptyTotals(): Totals {
  return { USD: 0, SYP: 0 };
}

function addBalances(target: Totals, rows: CurrencyBalance[]) {
  for (const row of rows) if (row.currency in target) target[row.currency as 'USD' | 'SYP'] += Number(row.amount || 0);
}

/** Sign sits inside the isolated LTR span so RTL never detaches it from the digits. */
function fmt(amount: number, currency: string) {
  const digits = currency === 'SYP' ? 0 : 2;
  const body = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${amount < 0 ? '-' : ''}${body}`;
}

function Money({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return (
    <span dir="ltr" className={`dash-num${amount < 0 ? ' is-neg' : ''}${className ? ` ${className}` : ''}`}>
      {fmt(amount, currency)} {currency}
    </span>
  );
}

function Pair({ totals }: { totals: Totals }) {
  return (
    <span className="dash-pair">
      <Money amount={totals.USD} currency="USD" className="dash-main" />
      <Money amount={totals.SYP} currency="SYP" className="dash-sub" />
    </span>
  );
}

function go(hash: string) {
  window.location.hash = hash;
}

function monthRange() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

function pnlTotals(books: PnlBook[], pick: (book: PnlBook) => number): Totals {
  const totals = emptyTotals();
  for (const book of books) totals[book.currency] += pick(book);
  return totals;
}

function lineAmount(rows: { code: string; amount: string }[], code: string) {
  return Number(rows.find((row) => row.code === code)?.amount || 0);
}

type Recent = {
  id: string;
  date: string;
  kind: 'قبض' | 'صرف';
  number: number;
  detail: string;
  currency: string;
  amount: number;
  status: string;
};

function statusBadge(status: string): { tone: BadgeTone; label: string } {
  if (status === 'COMPLETED') return { tone: 'ok', label: 'مكتملة' };
  if (status === 'PENDING_APPROVAL') return { tone: 'warn', label: 'معلّقة' };
  return { tone: 'danger', label: status };
}

function Tile({ href, accent, label, hint, children, negative }: { href: string; accent: string; label: string; hint: string; children: React.ReactNode; negative?: boolean }) {
  return (
    <a className="dash-tile" href={href} style={{ ['--accent' as string]: accent }}>
      <StatCard label={label} value={children} hint={hint} negative={negative} />
    </a>
  );
}

export function DashboardHome({ pending = 0, funds, incomes, outcomes }: Props) {
  const [items, setItems] = useState<OpenItemRow[]>([]);
  const [books, setBooks] = useState<PnlBook[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const { from, to } = monthRange();
    setLoading(true);
    Promise.all([listOpenItems(), getProfitAndLoss(from, to)])
      .then(([openItems, pnl]) => {
        if (!alive) return;
        setItems(openItems);
        setBooks(pnl.books);
        setError('');
      })
      .catch((reason: unknown) => alive && setError(reason instanceof Error ? reason.message : 'تعذر تحميل المؤشرات'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const cash = useMemo(() => {
    const totals = emptyTotals();
    if (funds) {
      addBalances(totals, funds.vault);
      addBalances(totals, funds.sham);
      for (const bank of funds.banks) addBalances(totals, bank.balances);
    }
    return totals;
  }, [funds]);

  const custody = useMemo(() => {
    const totals = emptyTotals();
    for (const row of funds?.custody ?? []) addBalances(totals, row.balances);
    return totals;
  }, [funds]);

  const { receivable, payable, overdue } = useMemo(() => {
    const rec = emptyTotals();
    const pay = emptyTotals();
    let late = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const item of items) {
      if (item.status !== 'OPEN' || !(item.currency in rec)) continue;
      const code = item.currency as 'USD' | 'SYP';
      const left = Number(item.remaining || 0);
      if (item.kind === 'RECEIVABLE') rec[code] += left;
      else if (item.kind === 'PAYABLE') pay[code] += left;
      else continue;
      if (item.dueDate && item.dueDate.slice(0, 10) < today && left > 0) late += 1;
    }
    return { receivable: rec, payable: pay, overdue: late };
  }, [items]);

  const sales = pnlTotals(books, (book) => lineAmount(book.income, '4100'));
  const purchases = pnlTotals(books, (book) => lineAmount(book.expenses, '5000'));
  const expenses = pnlTotals(books, (book) => lineAmount(book.expenses, '5200'));
  const net = pnlTotals(books, (book) => Number(book.netProfit || 0));
  const loss = net.USD < 0 || net.SYP < 0;

  const liquidity = useMemo(() => {
    const rows: { id: string; name: string; USD: number; SYP: number }[] = [];
    const pick = (list: CurrencyBalance[], code: string) => Number(list.find((row) => row.currency === code)?.amount || 0);
    if (funds) {
      rows.push({ id: 'vault', name: 'الخزنة', USD: pick(funds.vault, 'USD'), SYP: pick(funds.vault, 'SYP') });
      rows.push({ id: 'sham', name: 'شام كاش', USD: pick(funds.sham, 'USD'), SYP: pick(funds.sham, 'SYP') });
      for (const bank of funds.banks) {
        rows.push({ id: `bank-${bank.id}`, name: `بنك · ${bank.name}`, USD: pick(bank.balances, 'USD'), SYP: pick(bank.balances, 'SYP') });
      }
    }
    return rows;
  }, [funds]);

  const negativeFunds = liquidity.filter((row) => row.USD < 0 || row.SYP < 0);
  const usdBase = liquidity.reduce((sum, row) => sum + Math.max(row.USD, 0), 0);

  const recent = useMemo<Recent[]>(() => {
    const rows: Recent[] = [];
    for (const row of incomes) {
      rows.push({
        id: `i-${row.id}`,
        date: row.transactionDate.slice(0, 10),
        kind: 'قبض',
        number: row.operationNumber,
        detail: [row.sender, row.receiver].filter(Boolean).join(' → ') || row.description || '—',
        currency: row.currency,
        amount: Number(row.total || 0),
        status: row.status,
      });
    }
    for (const row of outcomes) {
      rows.push({
        id: `o-${row.id}`,
        date: row.transactionDate.slice(0, 10),
        kind: 'صرف',
        number: row.operationNumber,
        detail: [row.deliverer, row.receiver].filter(Boolean).join(' → ') || row.description || '—',
        currency: row.currency,
        amount: Number(row.total || 0),
        status: row.status,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number).slice(0, 5);
  }, [incomes, outcomes]);

  const recentColumns: Column<Recent>[] = [
    { key: 'date', header: 'التاريخ', render: (row) => <span dir="ltr" className="dash-num">{row.date}</span> },
    { key: 'kind', header: 'النوع', render: (row) => row.kind },
    { key: 'amount', header: 'المبلغ', numeric: true, render: (row) => <Money amount={row.amount} currency={row.currency} /> },
    { key: 'detail', header: 'البيان', render: (row) => row.detail },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => {
        const badge = statusBadge(row.status);
        return <Badge tone={badge.tone}>{badge.label}</Badge>;
      },
    },
  ];

  return (
    <div className="ent-page dash">
      <div className="dash-hello">
        <div>
          <h1>لوحة القيادة التنفيذية</h1>
        </div>
        <div className="dash-hello-actions">
          <Button onClick={() => setTick((value) => value + 1)}>{loading ? 'جاري التحديث…' : 'تحديث'}</Button>
          <Button variant="primary" onClick={() => go('accounting/statements')}>مركز التقارير</Button>
        </div>
      </div>

      {error ? <div className="dash-alert is-danger">{error}</div> : null}
      {negativeFunds.length > 0 ? (
        <div className="dash-alert is-danger">رصيد سالب في: {negativeFunds.map((row) => row.name).join('، ')}</div>
      ) : null}
      {overdue > 0 ? <div className="dash-alert is-warn">{overdue} ذمة متأخرة عن تاريخ الاستحقاق</div> : null}
      {pending > 0 ? <div className="dash-alert is-warn">{pending} طلب موافقة معلّق بانتظار قرارك</div> : null}

      <div className="dash-grid dash-row-4">
        <Tile href="#treasury/cash" accent="#13362f" label="إجمالي النقدية السائلة" hint="خزنة + شام كاش + بنوك" negative={cash.USD < 0 || cash.SYP < 0}>
          <Pair totals={cash} />
        </Tile>
        <Tile href="#accounting/open-items" accent="#8c6239" label="إجمالي ذمم الزبائن" hint="مستحق التحصيل">
          <Pair totals={receivable} />
        </Tile>
        <Tile href="#accounting/open-items" accent="#3e6f78" label="إجمالي ذمم الموردين" hint="مستحق السداد">
          <Pair totals={payable} />
        </Tile>
        <Tile href="#treasury/custody" accent="#6b5e4e" label="إجمالي عهد المستلفين" hint="دفتر فرعي للحساب 1300">
          <Pair totals={custody} />
        </Tile>
      </div>

      <h2 className="dash-section">المؤشرات الشهرية</h2>
      <div className="dash-grid dash-row-4">
        <Tile href="#accounting/statements" accent="#1b6b4a" label="مبيعات الشهر" hint="حساب 4100">
          <Pair totals={sales} />
        </Tile>
        <Tile href="#accounting/statements" accent="#8c6239" label="المشتريات" hint="حساب 5000">
          <Pair totals={purchases} />
        </Tile>
        <Tile href="#accounting/statements" accent="#5c6b73" label="المصروفات" hint="حساب 5200">
          <Pair totals={expenses} />
        </Tile>
        <Tile href="#accounting/statements" accent={loss ? '#b3261e' : '#1b6b4a'} label={loss ? 'صافي الخسارة' : 'صافي الربح'} hint="الشهر الحالي" negative={loss}>
          <Pair totals={net} />
        </Tile>
      </div>

      <div className="dash-grid dash-row-2">
        <Card
          title="آخر العمليات"
          toolbar={
            <>
              <Badge tone="neutral">{recent.length}</Badge>
              <Button onClick={() => go('treasury/cash')}>عرض الكل</Button>
            </>
          }
        >
          <DataTable columns={recentColumns} rows={recent} rowKey={(row) => row.id} empty="لا عمليات حديثة." />
        </Card>
        <Card title="حالة السيولة" toolbar={<Badge tone="neutral">{liquidity.length}</Badge>}>
          <div className="dash-liq">
            {liquidity.map((row) => {
              const share = usdBase > 0 ? Math.min(100, (Math.max(row.USD, 0) / usdBase) * 100) : 0;
              return (
                <a key={row.id} className="dash-liq-row" href="#treasury/cash">
                  <span className="dash-liq-name">{row.name}</span>
                  <span className="dash-pair">
                    <Money amount={row.USD} currency="USD" className="dash-main" />
                    <Money amount={row.SYP} currency="SYP" className="dash-sub" />
                  </span>
                  <span className="dash-bar"><i style={{ width: `${share}%` }} /></span>
                </a>
              );
            })}
            {liquidity.length === 0 ? <p className="dash-empty">لا صناديق.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
