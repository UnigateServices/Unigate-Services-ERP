'use client';

import { useEffect, useState } from 'react';
import {
  AccountRow,
  AuthUser,
  BalanceBook,
  BudgetRow,
  CashFlowBook,
  CostCenterRow,
  EquityChangeBook,
  FiscalPeriodRow,
  PnlBook,
  TrialBook,
  VarianceRow,
  closeFiscalPeriod,
  createBudget,
  deleteBudget,
  AccountingPolicy,
  getAccountingPolicy,
  getBalanceSheet,
  getBudgetVariance,
  closeFiscalYear,
  getCashFlow,
  FxRevaluationQuote,
  getEquityChanges,
  getProfitAndLoss,
  postFxRevaluation,
  previewFxRevaluation,
  reverseFxRevaluation,
  getTrialBalance,
  listAccounts,
  listBudgets,
  listCostCenters,
  listFiscalPeriods,
  reopenFiscalPeriod,
  reopenFiscalYear,
  setBudgetStatus,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Button } from './ui/button';
import { PrintButton } from './print/print-layout';
import type { PrintDoc } from './print/print-types';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Field, Input } from './ui/field';
import { Select } from './ui/select';
import { PolicyNotes } from './policy-notes';
import { EmptyState, Table } from './ui/table';
import { useToasts } from './ui/toasts';

type Tab = 'pnl' | 'balance' | 'trial' | 'cash' | 'equity' | 'budget' | 'periods' | 'policy';

const TITLES: Record<Tab, string> = {
  pnl: 'قائمة الأرباح والخسائر',
  balance: 'الميزانية العمومية',
  trial: 'ميزان المراجعة',
  cash: 'التدفقات النقدية',
  equity: 'التغير في حقوق الملكية',
  budget: 'ميزانية مقابل الفعلي',
  periods: 'الفترات',
  policy: 'ملاحظات السياسة',
};

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const STATEMENT_TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'الأرباح والخسائر' },
  { id: 'balance', label: 'الميزانية' },
  { id: 'trial', label: 'ميزان المراجعة' },
  { id: 'cash', label: 'التدفقات' },
  { id: 'equity', label: 'حقوق الملكية' },
  { id: 'budget', label: 'الميزانية والفعلي' },
  { id: 'periods', label: 'الفترات' },
  { id: 'policy', label: 'السياسة' },
];

export function StatementsPanel({ actor, screen = 'pnl' }: { actor: AuthUser; screen?: Tab }) {
  const canWrite = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const canReopen = actor.role === 'GENERAL_MANAGER';
  const { push, node: toasts } = useToasts();
  const [tab, setTab] = useState<Tab>(screen);
  const [policy, setPolicy] = useState<AccountingPolicy | null>(null);
  const [revalDate, setRevalDate] = useState(today());
  const [revalRate, setRevalRate] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [revalQuote, setRevalQuote] = useState<FxRevaluationQuote | null>(null);
  const [currency, setCurrency] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [centers, setCenters] = useState<CostCenterRow[]>([]);
  const [budgetCurrency, setBudgetCurrency] = useState<'USD' | 'SYP'>('USD');
  const [cash, setCash] = useState<CashFlowBook[]>([]);
  const [equity, setEquity] = useState<EquityChangeBook[]>([]);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [pnl, setPnl] = useState<PnlBook[]>([]);
  const [balance, setBalance] = useState<BalanceBook[]>([]);
  const [trial, setTrial] = useState<TrialBook[]>([]);
  const [periods, setPeriods] = useState<FiscalPeriodRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [variance, setVariance] = useState<VarianceRow[] | null>(null);
  const [budgetId, setBudgetId] = useState('');
  const [budgetName, setBudgetName] = useState('');
  const [budgetAccount, setBudgetAccount] = useState('');
  const [budgetMonth, setBudgetMonth] = useState('1');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [draftLines, setDraftLines] = useState<{ accountId: string; month: number; amount: number; label: string }[]>([]);

  async function loadStatements() {
    const code = currency || undefined;
    const center = costCenterId || undefined;
    const rate = currency === 'FUNCTIONAL' ? Number(fxRate) : undefined;
    const [pnlDoc, balanceDoc, trialDoc, cashDoc, equityDoc] = await Promise.all([
      getProfitAndLoss(from, to, code, center, rate),
      getBalanceSheet(asOf, code, center, rate),
      getTrialBalance(asOf, code, center, rate),
      getCashFlow(from, to, code, center, rate),
      getEquityChanges(from, to, code, center, rate),
    ]);
    setPnl(pnlDoc.books);
    setBalance(balanceDoc.books);
    setTrial(trialDoc.books);
    setCash(cashDoc.books);
    setEquity(equityDoc.books);
  }

  async function loadControl() {
    const year = Number(from.slice(0, 4)) || new Date().getFullYear();
    const [periodRows, budgetRows, accountRows, centerRows] = await Promise.all([
      listFiscalPeriods(year),
      listBudgets(),
      listAccounts(),
      listCostCenters(),
    ]);
    setPeriods(periodRows);
    setBudgets(budgetRows);
    setCenters(centerRows);
    setAccounts(accountRows.filter((row) => row.status === 'ACTIVE' && (row.type === 'INCOME' || row.type === 'EXPENSE')));
    if (!budgetId && budgetRows[0]) setBudgetId(budgetRows[0].id);
  }

  useEffect(() => {
    loadStatements().catch((error) => push(masterErrorMessage(error), 'err'));
    loadControl().catch((error) => push(masterErrorMessage(error), 'err'));
    getAccountingPolicy().then(setPolicy).catch((error) => push(masterErrorMessage(error), 'err'));
  }, []);

  async function run() {
    if (currency === 'FUNCTIONAL' && !(Number(fxRate) > 0)) {
      push('أدخل سعر الإقفال لعرض القوائم بعملة القياس.', 'err');
      return;
    }
    try {
      await loadStatements();
      if (budgetId) {
        const doc = await getBudgetVariance(budgetId, from, to, costCenterId || undefined);
        setVariance(doc.rows);
      }
      push('تم تحديث القوائم من القيود المرحّلة.', 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  async function saveBudget() {
    if (!budgetName.trim() || !draftLines.length) {
      push('أدخل اسم الميزانية وبنداً واحداً على الأقل.', 'err');
      return;
    }
    try {
      const row = await createBudget({
        name: budgetName.trim(),
        year: Number(from.slice(0, 4)),
        currency: budgetCurrency,
        lines: draftLines.map((line) => ({ accountId: line.accountId, month: line.month, amount: line.amount })),
      });
      setBudgets((current) => [row, ...current]);
      setBudgetId(row.id);
      setBudgetName('');
      setDraftLines([]);
      push('حُفظت الميزانية كمسودة.', 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  const periodColumns: Column<FiscalPeriodRow>[] = [
    { key: 'month', header: 'الشهر', render: (row) => MONTHS[row.month - 1] },
    { key: 'from', header: 'من', render: (row) => <span dir="ltr" className="stmt-num">{row.startsOn}</span> },
    { key: 'to', header: 'إلى', render: (row) => <span dir="ltr" className="stmt-num">{row.endsOn}</span> },
    { key: 'status', header: 'الحالة', render: (row) => <Badge tone={row.status === 'OPEN' ? 'ok' : 'neutral'}>{row.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}</Badge> },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) => (
        <>
          {canWrite && row.status === 'OPEN' ? (
            <Button variant="mini" onClick={() => void closeFiscalPeriod(row.id).then((next) => setPeriods((current) => current.map((item) => (item.id === next.id ? next : item)))).catch((error) => push(masterErrorMessage(error), 'err'))}>
              إقفال
            </Button>
          ) : null}
          {canReopen && row.status === 'CLOSED' ? (
            <Button variant="mini" onClick={() => void reopenFiscalPeriod(row.id).then((next) => setPeriods((current) => current.map((item) => (item.id === next.id ? next : item)))).catch((error) => push(masterErrorMessage(error), 'err'))}>
              إعادة فتح
            </Button>
          ) : null}
        </>
      ),
    },
  ];

  function statementDoc(): PrintDoc | null {
    let rows: StmtRow[] = [];
    let currencyCode = '';
    let range = `${from} → ${to}`;
    if (tab === 'pnl' && pnl[0]) {
      rows = profitRows(pnl[0]);
      currencyCode = pnl[0].currency;
    } else if (tab === 'cash' && cash[0]) {
      rows = cashRowList(cash[0]);
      currencyCode = cash[0].currency;
    } else if (tab === 'equity' && equity[0]) {
      rows = equityRowList(equity[0]);
      currencyCode = equity[0].currency;
    } else if (tab === 'balance' && balance[0]) {
      const book = balance[0];
      currencyCode = book.currency;
      range = asOf;
      rows = [
        { key: 'a', name: 'الأصول', amount: '', kind: 'section' },
        ...book.assets.map((row) => ({ key: `a${row.code}`, name: row.name, amount: row.amount, kind: 'detail' as const })),
        { key: 'ta', name: 'مجموع الأصول', amount: book.totalAssets, kind: 'total' },
        { key: 'l', name: 'الالتزامات', amount: '', kind: 'section' },
        ...book.liabilities.map((row) => ({ key: `l${row.code}`, name: row.name, amount: row.amount, kind: 'detail' as const })),
        { key: 'tl', name: 'مجموع الالتزامات', amount: book.totalLiabilities, kind: 'total' },
        { key: 'e', name: 'حقوق الملكية', amount: '', kind: 'section' },
        ...book.equity.map((row) => ({ key: `e${row.code}`, name: row.name, amount: row.amount, kind: 'detail' as const })),
        { key: 'te', name: 'مجموع حقوق الملكية', amount: book.totalEquity, kind: 'total' },
      ];
    } else if (tab === 'trial' && trial[0]) {
      const book = trial[0];
      currencyCode = book.currency;
      range = asOf;
      rows = book.rows.map((row) => ({ key: row.code, name: `${row.code} — ${row.name} (مدين ${money(row.debit)} / دائن ${money(row.credit)})`, amount: String(Number(row.debit) - Number(row.credit)), kind: 'detail' as const }));
    }
    if (!rows.length) return null;
    return {
      title: TITLES[tab],
      number: currencyCode || '—',
      date: range,
      currency: currencyCode || '—',
      total: String(rows.length),
      lines: rows.map((row) => ({ name: row.name, total: row.kind === 'section' ? '' : money(row.amount) })),
      signatures: ['المحاسب', 'المدير المالي'],
    };
  }

  const pnlAccounts = accounts.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }));

  return (
    <div className="ui-page">
      {toasts}
      <div className="stmt-tabs" role="tablist" aria-label="التقارير والقوائم المالية">
        {STATEMENT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`rpt-pill${tab === item.id ? ' is-on' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'policy' ? null : (
      <>
      <div className="stmt-bar">
        {tab === 'balance' || tab === 'trial' ? (
          <Field label="حتى تاريخ">
            <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="من">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="إلى">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </>
        )}
        <Field label="العملة">
          <Select
            value={currency}
            onChange={setCurrency}
            placeholder="كل العملات"
            options={[
              { value: '', label: 'كل العملات' },
              { value: 'USD', label: 'دولار' },
              { value: 'SYP', label: 'ليرة' },
              { value: 'FUNCTIONAL', label: 'عملة القياس' },
            ]}
          />
        </Field>
        {currency === 'FUNCTIONAL' ? (
          <Field label="سعر الإقفال">
            <Input dir="ltr" inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} />
          </Field>
        ) : null}
        <Field label="مركز التكلفة">
          <Select
            value={costCenterId}
            onChange={setCostCenterId}
            placeholder="كل المراكز"
            options={[
              { value: '', label: 'كل المراكز' },
              ...centers.map((row) => ({ value: row.id, label: `${row.kind === 'LOCATION' ? 'مكتب' : 'مشروع'} — ${row.name}` })),
            ]}
          />
        </Field>
        <div className="stmt-bar-actions">
          <Button variant="primary" onClick={() => void run()}>
            تحديث
          </Button>
          <PrintButton variant="soft" disabled={!statementDoc()} getDoc={statementDoc} />
        </div>
      </div>
      <p className="stmt-hint">تُقرأ القوائم من القيود المرحّلة. عملة القياس تترجم الإيراد والمصروف بسعر كل عملية، والنقد والذمم بسعر الإقفال.</p>
      </>
      )}

      {tab === 'policy' ? <PolicyNotes policy={policy} /> : null}

      {tab === 'pnl'
        ? visible(pnl, (book) => book.income.length + book.expenses.length > 0).map((book) => (
            <Card key={book.currency} title={`${TITLES.pnl} — ${book.currency}`} chip={from + ' → ' + to}>
              <StmtTable id="stmt-pnl" rows={profitRows(book)} />
              <p className="ui-note">
                التصنيف تشغيلي حسب المعيار 18، لأن بنود النشاط الحالية كلها من التشغيل. مجمل الربح = المبيعات − تكلفة المبيعات − المشتريات. لا يوجد بعد بند تمويل ولا ضريبة، فيتساوى الربح التشغيلي مع الربح. قيد إقفال السنة لا يُخصم من هذه القائمة.
              </p>
            </Card>
          ))
        : null}
      {tab === 'pnl' && !visible(pnl, (book) => book.income.length + book.expenses.length > 0).length ? (
        <EmptyState title="لا حركة إيراد أو مصروف في هذه الفترة." />
      ) : null}

      {tab === 'balance'
        ? visible(balance, (book) => book.assets.length + book.liabilities.length + book.equity.length > 0).map((book) => (
            <Card key={book.currency} title={`الميزانية العمومية — ${book.currency}`} chip={asOf} badge={book.balanced ? 'متوازنة' : 'غير متوازنة'}>
              <AmountTable title="الأصول" rows={book.assets} totalLabel="مجموع الأصول" total={book.totalAssets} />
              <AmountTable title="الالتزامات" rows={book.liabilities} totalLabel="مجموع الالتزامات" total={book.totalLiabilities} />
              <AmountTable title="حقوق الملكية" rows={book.equity} totalLabel="مجموع حقوق الملكية" total={book.totalEquity} />
              <p className="ui-note">الفرق {money(book.difference)}. المعادلة: الأصول = الالتزامات + حقوق الملكية.</p>
            </Card>
          ))
        : null}
      {tab === 'balance' && !visible(balance, (book) => book.assets.length + book.liabilities.length + book.equity.length > 0).length ? (
        <EmptyState title="لا أرصدة مرحّلة حتى هذا التاريخ." />
      ) : null}

      {tab === 'cash'
        ? visible(cash, (book) => cashActive(book)).map((book) => (
            <Card
              key={book.currency}
              title={`التدفقات النقدية — ${book.currency}`}
              chip="IAS 7 · غير مباشرة"
              badge={book.reconciled ? 'متطابقة' : 'فرق'}
            >
              <StmtTable id="stmt-cash" rows={cashRowList(book)} />
              <p className="ui-note">
                الموجب تدفق داخل. أرباح الترجمة وخسائرها تُستبعد من التشغيل لأنها غير نقدية، ومركز العملات نشاط استثماري بعد استبعاد إعادة التقييم.
                أثر السعر على النقد يُعرض وحده. قيد إقفال السنة مستبعد لأنه نقل داخل حقوق الملكية.
                {Number(book.revaluationExcluded) !== 0
                  ? ` استُبعدت إعادة تقييم غير نقدية مقدارها ${money(absAmount(book.revaluationExcluded))} من الاستثمار.`
                  : ''}
              </p>
            </Card>
          ))
        : null}

      {tab === 'equity'
        ? visible(equity, (book) => Number(book.opening) !== 0 || Number(book.profit) !== 0 || Number(book.capital) !== 0 || Number(book.retained) !== 0).map((book) => (
            <Card key={book.currency} title={`التغير في حقوق الملكية — ${book.currency}`}>
              <StmtTable id="stmt-equity" rows={equityRowList(book)} />
            </Card>
          ))
        : null}

      {tab === 'trial'
        ? visible(trial, (book) => book.rows.length > 0).map((book) => (
            <Card key={book.currency} title={`ميزان المراجعة — ${book.currency}`} badge={book.balanced ? 'متوازن' : 'غير متوازن'}>
              {book.rows.length ? (
                <TrialTable book={book} />
              ) : (
                <EmptyState title="لا قيود مرحّلة بهذه العملة حتى هذا التاريخ." />
              )}
            </Card>
          ))
        : null}

      {tab === 'budget' ? (
        <>
          <Card title="ميزانية مقابل الفعلي">
            <div className="stmt-bar">
              <div className="stmt-inline">
                <Field label="الميزانية">
                  <Select
                    value={budgetId}
                    onChange={setBudgetId}
                    placeholder="اختر ميزانية"
                    options={budgets.map((row) => ({ value: row.id, label: `${row.name} — ${row.year} ${row.currency} (${row.status === 'ACTIVE' ? 'معتمدة' : 'مسودة'})` }))}
                  />
                </Field>
              </div>
              <div className="stmt-bar-actions">
                <Button
                  variant="primary"
                  className="is-action"
                  disabled={!budgetId}
                  onClick={() =>
                    void getBudgetVariance(budgetId, from, to)
                      .then((doc) => setVariance(doc.rows))
                      .catch((error) => push(masterErrorMessage(error), 'err'))
                  }
                >
                  مقارنة
                </Button>
              </div>
            </div>
            {variance ? (
              variance.length ? (
                <VarianceTable rows={variance} />
              ) : (
                <EmptyState title="لا بنود ميزانية داخل الفترة المحددة." />
              )
            ) : null}
          </Card>
          {canWrite ? (
            <Card title="ميزانية جديدة" chip="حسابات الإيراد والمصروف فقط">
              <div className="ui-form-grid">
                <Field label="الاسم">
                  <Input value={budgetName} onChange={(event) => setBudgetName(event.target.value)} />
                </Field>
                <Field label="عملة الميزانية">
                  <Select
                    value={budgetCurrency}
                    onChange={(value) => setBudgetCurrency(value === 'SYP' ? 'SYP' : 'USD')}
                    options={[
                      { value: 'USD', label: 'دولار' },
                      { value: 'SYP', label: 'ليرة' },
                    ]}
                  />
                </Field>
                <Field label="الحساب">
                  <Select value={budgetAccount} onChange={setBudgetAccount} placeholder="اختر حساباً" options={pnlAccounts} />
                </Field>
                <Field label="الشهر">
                  <Select
                    value={budgetMonth}
                    onChange={setBudgetMonth}
                    options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
                  />
                </Field>
                <Field label="المبلغ">
                  <Input inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} />
                </Field>
              </div>
              <div className="ui-form-actions">
                <Button
                  variant="secondary"
                  className="is-action"
                  onClick={() => {
                    const amount = Number(budgetAmount);
                    const account = accounts.find((row) => row.id === budgetAccount);
                    if (!account || !Number.isFinite(amount) || amount < 0) {
                      push('اختر حساباً وأدخل مبلغاً صالحاً.', 'err');
                      return;
                    }
                    setDraftLines((current) => [
                      ...current,
                      { accountId: account.id, month: Number(budgetMonth), amount, label: `${account.code} — ${MONTHS[Number(budgetMonth) - 1]}` },
                    ]);
                    setBudgetAmount('');
                  }}
                >
                  إضافة بند
                </Button>
                <Button variant="primary" className="is-action" onClick={() => void saveBudget()}>
                  حفظ المسودة
                </Button>
              </div>
              {draftLines.length ? (
                <ul>
                  {draftLines.map((line, index) => (
                    <li key={`${line.accountId}-${line.month}-${index}`}>
                      {line.label}: {money(line.amount)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {budgets.filter((row) => row.status === 'DRAFT').map((row) => (
                <div key={row.id} className="ui-inline-actions">
                  <span>{row.name}</span>
                  <Button variant="primary" className="is-action" onClick={() => void setBudgetStatus(row.id, 'ACTIVE').then((next) => setBudgets((current) => current.map((item) => (item.year === next.year && item.currency === next.currency && item.id !== next.id && item.status === 'ACTIVE' ? { ...item, status: 'DRAFT' } : item.id === next.id ? next : item))))}>
                    اعتماد
                  </Button>
                  <Button variant="danger" className="is-action" onClick={() => void deleteBudget(row.id).then(() => setBudgets((current) => current.filter((item) => item.id !== row.id)))}>
                    حذف
                  </Button>
                </div>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'periods' && canWrite ? (
        <Card title="إعادة تقييم العملة الأجنبية" chip="سعر الإقفال">
          <p className="ui-note">
            يُعاد قياس مركز العملة الأجنبية المفتوح بسعر الإقفال (ليرة لكل دولار). الفرق يُرحَّل في العملة الوظيفية. الكمية لا تتغير، والتصحيح بالعكس.
          </p>
          <div className="stmt-bar">
            <div className="stmt-inline">
              <Field label="حتى تاريخ">
                <Input type="date" value={revalDate} onChange={(event) => setRevalDate(event.target.value)} />
              </Field>
              <Field label="سعر الإقفال">
                <Input inputMode="decimal" value={revalRate} placeholder="ل.س / دولار" onChange={(event) => setRevalRate(event.target.value)} />
              </Field>
            </div>
            <div className="stmt-bar-actions">
              <Button
                variant="secondary"
                className="is-action"
                onClick={() => {
                  const rate = Number(revalRate);
                  if (!(rate > 0)) {
                    push('أدخل سعر إقفال أكبر من صفر.', 'err');
                    return;
                  }
                  void previewFxRevaluation(revalDate, rate).then(setRevalQuote).catch((error) => push(masterErrorMessage(error), 'err'));
                }}
              >
                معاينة
              </Button>
              <Button
                variant="primary"
                className="is-action"
                onClick={() => {
                  const rate = Number(revalRate);
                  if (!(rate > 0)) {
                    push('أدخل سعر إقفال أكبر من صفر.', 'err');
                    return;
                  }
                  void postFxRevaluation(revalDate, rate)
                    .then((quote) => {
                      setRevalQuote(quote);
                      push('رُحّل قيد إعادة التقييم.', 'ok');
                    })
                    .catch((error) => push(masterErrorMessage(error), 'err'));
                }}
              >
                ترحيل
              </Button>
              {canReopen ? (
                <Button
                  variant="danger"
                  className="is-action"
                  onClick={() => void reverseFxRevaluation(revalDate).then(() => {
                    setRevalQuote(null);
                    push('عُكس تقييم هذا التاريخ.', 'ok');
                  }).catch((error) => push(masterErrorMessage(error), 'err'))}
                >
                  عكس
                </Button>
              ) : null}
            </div>
          </div>
          {revalQuote ? (
            <p className="ui-note">
              كمية أجنبية {money(revalQuote.foreignQty)} — تكلفة {money(revalQuote.carrying)} {revalQuote.functionalCurrency} — قيمة الإقفال {money(revalQuote.closingValue)} — الفرق {money(revalQuote.gain)}
            </p>
          ) : null}
        </Card>
      ) : null}

      {tab === 'periods' ? (
        <Card
          title={`الفترات المالية ${from.slice(0, 4)}`}
          chip="إقفال الفترة يمنع الترحيل"
          toolbar={
            canReopen ? (
              <div className="ui-toolbar">
                <Button variant="secondary" onClick={() => void closeFiscalYear(Number(from.slice(0, 4))).then(setPeriods).catch((error) => push(masterErrorMessage(error), 'err'))}>
                  إقفال السنة
                </Button>
                <Button variant="ghost" onClick={() => void reopenFiscalYear(Number(from.slice(0, 4))).then(setPeriods).catch((error) => push(masterErrorMessage(error), 'err'))}>
                  فتح السنة
                </Button>
              </div>
            ) : null
          }
        >
          <DataTable tableId="fiscal-periods" columns={periodColumns} rows={periods} rowKey={(row) => row.id} />
        </Card>
      ) : null}
    </div>
  );
}

type StmtRow = { key: string; name: string; amount: string; kind: 'section' | 'detail' | 'total' };

function amountColumns(head = 'البند'): Column<StmtRow>[] {
  return [
    {
      key: 'name',
      header: head,
      render: (row) => (row.kind === 'detail' ? row.name : <strong>{row.name}</strong>),
    },
    {
      key: 'amount',
      header: 'المبلغ',
      numeric: true,
      render: (row) =>
        row.kind === 'section' ? null : (
          <span dir="ltr" className={`stmt-num${Number(row.amount) < 0 ? ' is-neg' : ''}${row.kind === 'total' ? ' is-total' : ''}`}>
            {money(row.amount)}
          </span>
        ),
    },
  ];
}

function StmtTable({ id, rows, head }: { id: string; rows: StmtRow[]; head?: string }) {
  return <DataTable tableId={id} columns={amountColumns(head)} rows={rows} rowKey={(row) => row.key} />;
}

function TrialTable({ book }: { book: TrialBook }) {
  const columns: Column<TrialBook['rows'][number]>[] = [
    { key: 'code', header: 'الرمز', render: (row) => <span dir="ltr" className="stmt-num">{row.code}</span> },
    { key: 'name', header: 'الحساب', render: (row) => row.name },
    { key: 'debit', header: 'مدين', numeric: true, render: (row) => <span dir="ltr" className="stmt-num">{money(row.debit)}</span> },
    { key: 'credit', header: 'دائن', numeric: true, render: (row) => <span dir="ltr" className="stmt-num">{money(row.credit)}</span> },
    {
      key: 'net',
      header: 'الصافي',
      numeric: true,
      defaultHidden: true,
      render: (row) => <span dir="ltr" className="stmt-num">{money(Number(row.debit) - Number(row.credit))}</span>,
    },
  ];
  return (
    <>
      <DataTable tableId="trial-balance" columns={columns} rows={book.rows} rowKey={(row) => row.code} />
      <p className="stmt-total-line">
        المجموع: مدين <span dir="ltr" className="stmt-num">{money(book.totalDebit)}</span> · دائن <span dir="ltr" className="stmt-num">{money(book.totalCredit)}</span>
      </p>
    </>
  );
}

function VarianceTable({ rows }: { rows: VarianceRow[] }) {
  const columns: Column<VarianceRow>[] = [
    { key: 'account', header: 'الحساب', render: (row) => `${row.code} — ${row.name}` },
    { key: 'line', header: 'البند', render: (row) => row.line },
    { key: 'budget', header: 'الميزانية', numeric: true, render: (row) => <span dir="ltr" className="stmt-num">{money(row.budget)}</span> },
    { key: 'actual', header: 'الفعلي', numeric: true, render: (row) => <span dir="ltr" className="stmt-num">{money(row.actual)}</span> },
    { key: 'variance', header: 'الفرق', numeric: true, render: (row) => <span dir="ltr" className="stmt-num">{money(row.variance)}</span> },
    { key: 'state', header: 'التقييم', defaultHidden: false, render: (row) => <Badge tone={row.favorable ? 'ok' : 'danger'}>{row.favorable ? 'موافق' : 'انحراف'}</Badge> },
  ];
  return <DataTable tableId="budget-variance" columns={columns} rows={rows} rowKey={(row) => row.accountId + row.line} />;
}

function equityRowList(book: EquityChangeBook): StmtRow[] {
  const rows: StmtRow[] = [
    { key: 'opening', name: 'الرصيد أول الفترة', amount: book.opening, kind: 'detail' },
    { key: 'profit', name: 'ربح الفترة', amount: book.profit, kind: 'detail' },
    { key: 'capital', name: 'حركة رأس المال', amount: book.capital, kind: 'detail' },
  ];
  if (Number(book.retained) !== 0) rows.push({ key: 'retained', name: 'حركة أرباح محتجزة أخرى', amount: book.retained, kind: 'detail' });
  rows.push({ key: 'closing', name: 'الرصيد آخر الفترة', amount: book.closing, kind: 'total' });
  return rows;
}

function cashActive(book: CashFlowBook) {
  return [book.profit, book.operating, book.investingTotal, book.financingTotal, book.fxOnCash, book.cashMovement].some(
    (amount) => Number(amount) !== 0,
  );
}

function absAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount).toFixed(2) : value;
}

function cashRowList(book: CashFlowBook): StmtRow[] {
  const rows: StmtRow[] = [
    { key: 'operating', name: 'الأنشطة التشغيلية', amount: '', kind: 'section' },
    { key: 'profit', name: 'صافي الربح', amount: book.profit, kind: 'detail' },
    ...book.adjustments.map((line) => ({ key: `adj-${line.code}`, name: line.name, amount: line.amount, kind: 'detail' as const })),
    ...book.workingCapital.map((line) => ({ key: `wc-${line.code}`, name: line.name, amount: line.amount, kind: 'detail' as const })),
    { key: 'operating-total', name: 'صافي النقد من الأنشطة التشغيلية', amount: book.operating, kind: 'total' },
    { key: 'investing', name: 'الأنشطة الاستثمارية', amount: '', kind: 'section' },
    ...book.investing.map((line) => ({ key: `inv-${line.code}`, name: line.name, amount: line.amount, kind: 'detail' as const })),
    { key: 'investing-total', name: 'صافي النقد من الأنشطة الاستثمارية', amount: book.investingTotal, kind: 'total' },
    { key: 'financing', name: 'الأنشطة التمويلية', amount: '', kind: 'section' },
    ...book.financing.map((line) => ({ key: `fin-${line.code}`, name: line.name, amount: line.amount, kind: 'detail' as const })),
    { key: 'financing-total', name: 'صافي النقد من الأنشطة التمويلية', amount: book.financingTotal, kind: 'total' },
  ];
  if (Number(book.fxOnCash) !== 0) {
    rows.push({ key: 'fx', name: 'أثر تغير أسعار الصرف على النقد', amount: book.fxOnCash, kind: 'total' });
  }
  rows.push(
    { key: 'net', name: 'صافي التغير في النقد وما في حكمه', amount: book.netChange, kind: 'total' },
    { key: 'cash', name: 'حركة النقد وما في حكمه', amount: book.cashMovement, kind: 'total' },
    { key: 'diff', name: 'الفرق', amount: book.difference, kind: 'total' },
  );
  return rows;
}

function visible<T>(rows: T[], has: (row: T) => boolean) {
  const active = rows.filter(has);
  return active.length ? active : [];
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
  rows.push({ key: 'before-financing', name: 'الربح قبل التمويل والضريبة', amount: operating.toFixed(2), kind: 'total' });
  rows.push({ key: 'profit', name: 'الربح', amount: book.netProfit, kind: 'total' });
  return rows;
}

function AmountTable({
  title,
  rows,
  totalLabel,
  total,
}: {
  title: string;
  rows: { code: string; name: string; amount: string }[];
  totalLabel: string;
  total: string;
}) {
  if (!rows.length) return <EmptyState title={`لا حركة في ${title}.`} />;
  const list: StmtRow[] = [
    ...rows.map((row) => ({ key: row.code, name: row.name, amount: row.amount, kind: 'detail' as const })),
    { key: '__total', name: totalLabel, amount: total, kind: 'total' },
  ];
  return <StmtTable id="stmt-balance" rows={list} head={title} />;
}
