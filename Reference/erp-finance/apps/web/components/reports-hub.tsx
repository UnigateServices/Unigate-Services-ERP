'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  BalanceBook,
  CostCenterRow,
  JournalEntryRow,
  PnlBook,
  TrialBook,
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
  listCostCenters,
  listJournalEntries,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Field, Input } from './ui/field';
import { Select } from './ui/select';
import { useToasts } from './ui/toasts';
import './enterprise.css';

type Tab = 'trial' | 'pnl' | 'balance' | 'ledger';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trial', label: 'ميزان المراجعة' },
  { id: 'pnl', label: 'قائمة الدخل' },
  { id: 'balance', label: 'المركز المالي' },
  { id: 'ledger', label: 'دفتر الأستاذ العام' },
];

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function dayOf(value: string) {
  return value.slice(0, 10);
}

function profitRows(book: PnlBook) {
  const byCode = new Map<string, { name: string; amount: number }>();
  for (const row of book.income) byCode.set(row.code, { name: row.name, amount: Number(row.amount) });
  for (const row of book.expenses) byCode.set(row.code, { name: row.name, amount: -Number(row.amount) });
  const head = ['SALES', 'PURCHASES', 'COGS'];
  const tail = ['OPEX', 'FX_GAIN', 'FX_LOSS', 'FX_TRANSLATION_GAIN', 'FX_TRANSLATION_LOSS', 'OTHER_INCOME', 'OTHER_EXPENSE'];
  const rows: { key: string; name: string; amount: string; kind: 'section' | 'detail' | 'total' }[] = [
    { key: 'operating-head', name: 'التشغيل', amount: '', kind: 'section' },
  ];
  const used = new Set<string>();
  function pushCode(code: string) {
    const row = byCode.get(code);
    if (!row || row.amount === 0) return;
    used.add(code);
    rows.push({ key: code, name: row.name, amount: row.amount.toFixed(2), kind: 'detail' });
  }
  for (const code of head) pushCode(code);
  if (head.some((code) => byCode.get(code) && byCode.get(code)!.amount !== 0)) {
    const gross = head.reduce((sum, code) => sum + (byCode.get(code)?.amount ?? 0), 0);
    rows.push({ key: 'gross', name: 'مجمل الربح', amount: gross.toFixed(2), kind: 'total' });
  }
  for (const code of tail) pushCode(code);
  for (const [code, row] of byCode) {
    if (used.has(code) || row.amount === 0) continue;
    rows.push({ key: code, name: row.name, amount: row.amount.toFixed(2), kind: 'detail' });
  }
  const operating = [...byCode.values()].reduce((sum, row) => sum + row.amount, 0);
  rows.push({ key: 'operating', name: 'الربح التشغيلي', amount: operating.toFixed(2), kind: 'total' });
  rows.push({ key: 'profit', name: 'الربح', amount: book.netProfit, kind: 'total' });
  return rows;
}

function downloadExcel(filename: string, rows: string[][]) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><table>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`)
    .join('')}</table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsHub({ actor: _actor, initial = 'trial' }: { actor: AuthUser; initial?: Tab }) {
  const { push, node: toasts } = useToasts();
  const [tab, setTab] = useState<Tab>(initial);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [costCenterId, setCostCenterId] = useState('');
  const [centers, setCenters] = useState<CostCenterRow[]>([]);
  const [pnl, setPnl] = useState<PnlBook[]>([]);
  const [balance, setBalance] = useState<BalanceBook[]>([]);
  const [trial, setTrial] = useState<TrialBook[]>([]);
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);

  useEffect(() => {
    const center = costCenterId || undefined;
    Promise.all([
      getProfitAndLoss(from, to, undefined, center),
      getBalanceSheet(to, undefined, center),
      getTrialBalance(to, undefined, center),
      listJournalEntries(),
      listCostCenters(),
    ])
      .then(([pnlDoc, balanceDoc, trialDoc, journal, centerRows]) => {
        setPnl(pnlDoc.books);
        setBalance(balanceDoc.books);
        setTrial(trialDoc.books);
        setEntries(journal);
        setCenters(centerRows);
      })
      .catch((error) => push(masterErrorMessage(error), 'err'));
  }, [from, to, costCenterId]);

  const ledger = useMemo(() => {
    return entries
      .filter((entry) => entry.status === 'POSTED' && dayOf(entry.transactionDate) >= from && dayOf(entry.transactionDate) <= to)
      .flatMap((entry) =>
        entry.lines
          .filter((line) => !costCenterId || line.costCenterId === costCenterId)
          .map((line) => ({
            id: line.id,
            date: dayOf(entry.transactionDate),
            number: entry.number,
            account: `${line.account.code} ${line.account.name}`,
            debit: line.debit,
            credit: line.credit,
            currency: line.currency,
            center: line.costCenter?.name || '—',
            memo: line.memo || entry.description || '—',
          })),
      );
  }, [entries, from, to, costCenterId]);

  function exportExcel() {
    if (tab === 'trial') {
      downloadExcel('trial-balance.xls', [
        ['العملة', 'الرمز', 'الحساب', 'مدين', 'دائن'],
        ...trial.flatMap((book) => [
          ...book.rows.map((row) => [book.currency, row.code, row.name, row.debit, row.credit]),
          [book.currency, '', 'المجموع', book.totalDebit, book.totalCredit],
        ]),
      ]);
      return;
    }
    if (tab === 'pnl') {
      downloadExcel('income-statement.xls', [
        ['العملة', 'البند', 'المبلغ'],
        ...pnl.flatMap((book) => profitRows(book).map((row) => [book.currency, row.name, row.amount])),
      ]);
      return;
    }
    if (tab === 'balance') {
      downloadExcel('balance-sheet.xls', [
        ['العملة', 'البند', 'المبلغ'],
        ...balance.flatMap((book) => [
          ...book.assets.map((row) => [book.currency, row.name, row.amount]),
          [book.currency, 'مجموع الأصول', book.totalAssets],
          ...book.liabilities.map((row) => [book.currency, row.name, row.amount]),
          [book.currency, 'مجموع الالتزامات', book.totalLiabilities],
          ...book.equity.map((row) => [book.currency, row.name, row.amount]),
          [book.currency, 'مجموع حقوق الملكية', book.totalEquity],
        ]),
      ]);
      return;
    }
    downloadExcel('general-ledger.xls', [
      ['التاريخ', 'القيد', 'الحساب', 'مدين', 'دائن', 'العملة', 'المركز', 'البيان'],
      ...ledger.map((row) => [row.date, String(row.number), row.account, row.debit, row.credit, row.currency, row.center, row.memo]),
    ]);
  }

  const ledgerDebit = ledger.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const ledgerCredit = ledger.reduce((sum, row) => sum + Number(row.credit || 0), 0);

  return (
    <div className="ent-page ent-report">
      {toasts}
      <div className="ent-tabs" role="tablist" aria-label="مركز التقارير المالية">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="ent-ribbon">
        <Field label="من تاريخ">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="مركز التكلفة / الفرع">
          <Select
            value={costCenterId}
            onChange={setCostCenterId}
            placeholder="كل المراكز"
            options={[
              { value: '', label: 'كل المراكز' },
              ...centers.map((row) => ({
                value: row.id,
                label: `${row.kind === 'LOCATION' ? 'فرع' : 'مركز'} — ${row.name}`,
              })),
            ]}
          />
        </Field>
        <div className="ent-ribbon-end">
          <button type="button" className="ent-quiet" onClick={exportExcel}>تصدير Excel</button>
          <button type="button" className="ent-primary" onClick={() => window.print()}>طباعة</button>
        </div>
      </div>

      {tab === 'trial'
        ? trial.filter((book) => book.rows.length > 0).map((book) => (
            <div key={book.currency} className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>الرمز</th>
                    <th>الحساب — {book.currency}</th>
                    <th className="is-num">مدين</th>
                    <th className="is-num">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {book.rows.map((row) => (
                    <tr key={row.code}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td className="is-num">{money(row.debit)}</td>
                      <td className="is-num">{money(row.credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="is-total">
                    <td colSpan={2}>المجموع</td>
                    <td className="is-num">{money(book.totalDebit)}</td>
                    <td className="is-num">{money(book.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))
        : null}
      {tab === 'trial' && !trial.some((book) => book.rows.length > 0) ? <p className="ent-empty">لا قيود مرحّلة حتى هذا التاريخ.</p> : null}

      {tab === 'pnl'
        ? pnl.filter((book) => book.income.length + book.expenses.length > 0).map((book) => (
            <div key={book.currency} className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>البند — {book.currency}</th>
                    <th className="is-num">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {profitRows(book).map((row) => (
                    <tr key={row.key} className={row.kind === 'section' ? 'is-section' : row.kind === 'total' ? 'is-total' : ''}>
                      <td>{row.name}</td>
                      <td className="is-num">{row.kind === 'section' ? '' : money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        : null}
      {tab === 'pnl' && !pnl.some((book) => book.income.length + book.expenses.length > 0) ? (
        <p className="ent-empty">لا حركة إيراد أو مصروف في هذه الفترة.</p>
      ) : null}

      {tab === 'balance'
        ? balance.filter((book) => book.assets.length + book.liabilities.length + book.equity.length > 0).map((book) => (
            <div key={book.currency} className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>البند — {book.currency}</th>
                    <th className="is-num">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="is-section"><td>الأصول</td><td /></tr>
                  {book.assets.map((row) => (
                    <tr key={row.code}><td>{row.name}</td><td className="is-num">{money(row.amount)}</td></tr>
                  ))}
                  <tr className="is-total"><td>مجموع الأصول</td><td className="is-num">{money(book.totalAssets)}</td></tr>
                  <tr className="is-section"><td>الالتزامات</td><td /></tr>
                  {book.liabilities.map((row) => (
                    <tr key={row.code}><td>{row.name}</td><td className="is-num">{money(row.amount)}</td></tr>
                  ))}
                  <tr className="is-total"><td>مجموع الالتزامات</td><td className="is-num">{money(book.totalLiabilities)}</td></tr>
                  <tr className="is-section"><td>حقوق الملكية</td><td /></tr>
                  {book.equity.map((row) => (
                    <tr key={row.code}><td>{row.name}</td><td className="is-num">{money(row.amount)}</td></tr>
                  ))}
                  <tr className="is-total"><td>مجموع حقوق الملكية</td><td className="is-num">{money(book.totalEquity)}</td></tr>
                </tbody>
              </table>
            </div>
          ))
        : null}
      {tab === 'balance' && !balance.some((book) => book.assets.length + book.liabilities.length + book.equity.length > 0) ? (
        <p className="ent-empty">لا أرصدة مرحّلة حتى هذا التاريخ.</p>
      ) : null}

      {tab === 'ledger' ? (
        ledger.length === 0 ? (
          <p className="ent-empty">لا بنود مرحّلة في هذه الفترة.</p>
        ) : (
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>القيد</th>
                  <th>الحساب</th>
                  <th className="is-num">مدين</th>
                  <th className="is-num">دائن</th>
                  <th>العملة</th>
                  <th>المركز</th>
                  <th>البيان</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.number}</td>
                    <td>{row.account}</td>
                    <td className="is-num">{money(row.debit)}</td>
                    <td className="is-num">{money(row.credit)}</td>
                    <td>{row.currency}</td>
                    <td>{row.center}</td>
                    <td>{row.memo}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="is-total">
                  <td colSpan={3}>المجموع</td>
                  <td className="is-num">{money(ledgerDebit)}</td>
                  <td className="is-num">{money(ledgerCredit)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
