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
  setInventoryMethod,
  getTrialBalance,
  listAccounts,
  listBudgets,
  listCostCenters,
  listFiscalPeriods,
  reopenFiscalPeriod,
  reopenFiscalYear,
  setBudgetStatus,
  setFunctionalCurrency,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { OpsButton } from './ops-button';
import { OpsCard } from './ops-card';
import { OpsField, OpsInput } from './ops-field';
import { OpsSelect } from './ops-select';
import { PolicyNotes } from './policy-notes';
import { OpsEmpty, OpsTable } from './ops-table';
import { useOpsToasts } from './ops-toasts';

type Tab = 'pnl' | 'balance' | 'trial' | 'cash' | 'equity' | 'budget' | 'periods' | 'policy';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'الأرباح والخسائر' },
  { id: 'balance', label: 'الميزانية العمومية' },
  { id: 'trial', label: 'ميزان المراجعة' },
  { id: 'cash', label: 'التدفقات النقدية' },
  { id: 'equity', label: 'حقوق الملكية' },
  { id: 'budget', label: 'ميزانية مقابل الفعلي' },
  { id: 'periods', label: 'الفترات' },
  { id: 'policy', label: 'ملاحظات السياسة' },
];

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

export function StatementsPanel({ actor }: { actor: AuthUser }) {
  const canWrite = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const canReopen = actor.role === 'GENERAL_MANAGER';
  const { push, node: toasts } = useOpsToasts();
  const [tab, setTab] = useState<Tab>('pnl');
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

  async function chooseCurrency(next: 'USD' | 'SYP') {
    if (actor.role !== 'GENERAL_MANAGER' || policy?.functionalCurrency === next) return;
    try {
      setPolicy(await setFunctionalCurrency(next));
      push(next === 'USD' ? 'العملة الوظيفية: الدولار.' : 'العملة الوظيفية: الليرة.', 'ok');
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

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

  const pnlAccounts = accounts.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }));

  return (
    <div className="ops-page">
      {toasts}
      <OpsCard title="إعدادات المحاسبة" chip="لكل شركة">
        <p className="ops-note">
          العملة الوظيفية هي عملة قياس الربح. فرق التصريف يُسجَّل فيها. المخزون يُقاس بمتوسط التكلفة المرجح: فاتورة الشراء تحدّث المتوسط، وفاتورة البيع ترحّل تكلفة البضاعة منه.
        </p>
        <div className="ops-toolbar">
          <OpsButton
            variant="choice"
            className={policy?.functionalCurrency === 'USD' ? 'is-on' : ''}
            disabled={actor.role !== 'GENERAL_MANAGER'}
            onClick={() => void chooseCurrency('USD')}
          >
            دولار — العملة الوظيفية
          </OpsButton>
          <OpsButton
            variant="choice"
            className={policy?.functionalCurrency === 'SYP' ? 'is-on' : ''}
            disabled={actor.role !== 'GENERAL_MANAGER'}
            onClick={() => void chooseCurrency('SYP')}
          >
            ليرة — العملة الوظيفية
          </OpsButton>
          <OpsButton
            variant="choice"
            className={policy?.inventoryMethod === 'WAC' ? 'is-on' : ''}
            disabled={actor.role !== 'GENERAL_MANAGER'}
            onClick={() => {
              void setInventoryMethod('WAC')
                .then(setPolicy)
                .then(() => push('سياسة المخزون: متوسط التكلفة المرجح.', 'ok'))
                .catch((error) => push(masterErrorMessage(error), 'err'));
            }}
          >
            مخزون — متوسط تكلفة مرجح
          </OpsButton>
        </div>
      </OpsCard>
      <OpsCard
        title="القوائم المالية"
        chip="من القيود المرحّلة"
        toolbar={
          <div className="ops-toolbar ops-tabs">
            {TABS.map((item) => (
              <OpsButton key={item.id} variant={tab === item.id ? 'primary' : 'ghost'} onClick={() => setTab(item.id)}>
                {item.label}
              </OpsButton>
            ))}
          </div>
        }
      >
        {tab === 'policy' ? (
          <p className="ops-note">هذه الملاحظات تصف أساس الأرقام المعروضة في التبويبات الأخرى، وتتبع العملة الوظيفية المختارة أعلاه.</p>
        ) : (
          <p className="ops-note">هذه القوائم تُقرأ من القيود المرحّلة. عملة القياس تترجم الإيراد والمصروف والمخزون وحقوق الملكية بسعر كل عملية، والنقد والذمم بسعر الإقفال، والفرق يظهر كربح أو خسارة ترجمة.</p>
        )}
        {tab === 'policy' ? null : <div className="ops-filter-bar">
          <div className={`ops-filter-fields${tab === 'balance' || tab === 'trial' ? ' is-compact' : ''}`}>
            {tab === 'balance' || tab === 'trial' ? null : (
              <OpsField label="من">
                <OpsInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </OpsField>
            )}
            {tab === 'balance' || tab === 'trial' ? null : (
              <OpsField label="إلى">
                <OpsInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </OpsField>
            )}
            {tab === 'balance' || tab === 'trial' ? (
              <OpsField label="حتى تاريخ">
                <OpsInput type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
              </OpsField>
            ) : null}
            <OpsField label="العملة">
              <OpsSelect
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
            </OpsField>
            {currency === 'FUNCTIONAL' ? (
              <OpsField label="سعر الإقفال">
                <OpsInput inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} />
              </OpsField>
            ) : null}
            <OpsField label="مركز التكلفة">
              <OpsSelect
                value={costCenterId}
                onChange={setCostCenterId}
                placeholder="كل المراكز"
                options={[
                  { value: '', label: 'كل المراكز' },
                  ...centers.map((row) => ({
                    value: row.id,
                    label: `${row.kind === 'LOCATION' ? 'مكتب' : 'مشروع'} — ${row.name}`,
                  })),
                ]}
              />
            </OpsField>
          </div>
          <div className="ops-filter-actions">
            <OpsButton variant="primary" className="is-action" onClick={() => void run()}>
              تحديث
            </OpsButton>
          </div>
        </div>}
      </OpsCard>

      {tab === 'policy' ? <PolicyNotes policy={policy} /> : null}

      {tab === 'pnl'
        ? visible(pnl, (book) => book.income.length + book.expenses.length > 0).map((book) => (
            <OpsCard key={book.currency} title={`قائمة الأرباح والخسائر — ${book.currency}`} chip={from + ' → ' + to}>
              <AmountTable title="الإيرادات" rows={book.income} totalLabel="مجموع الإيرادات" total={book.totalIncome} />
              <AmountTable title="المصروفات" rows={book.expenses} totalLabel="مجموع المصروفات" total={book.totalExpense} />
              <p className="ops-note">
                مجمل الربح {money(book.grossProfit)} — صافي الربح {money(book.netProfit)}. قيد إقفال السنة لا يُخصم من هذه القائمة؛ بعد الإقفال يظهر الربح في الأرباح المحتجزة.
              </p>
            </OpsCard>
          ))
        : null}
      {tab === 'pnl' && !visible(pnl, (book) => book.income.length + book.expenses.length > 0).length ? (
        <OpsEmpty title="لا حركة إيراد أو مصروف في هذه الفترة." />
      ) : null}

      {tab === 'balance'
        ? visible(balance, (book) => book.assets.length + book.liabilities.length + book.equity.length > 0).map((book) => (
            <OpsCard key={book.currency} title={`الميزانية العمومية — ${book.currency}`} chip={asOf} badge={book.balanced ? 'متوازنة' : 'غير متوازنة'}>
              <AmountTable title="الأصول" rows={book.assets} totalLabel="مجموع الأصول" total={book.totalAssets} />
              <AmountTable title="الالتزامات" rows={book.liabilities} totalLabel="مجموع الالتزامات" total={book.totalLiabilities} />
              <AmountTable title="حقوق الملكية" rows={book.equity} totalLabel="مجموع حقوق الملكية" total={book.totalEquity} />
              <p className="ops-note">الفرق {money(book.difference)}. المعادلة: الأصول = الالتزامات + حقوق الملكية.</p>
            </OpsCard>
          ))
        : null}
      {tab === 'balance' && !visible(balance, (book) => book.assets.length + book.liabilities.length + book.equity.length > 0).length ? (
        <OpsEmpty title="لا أرصدة مرحّلة حتى هذا التاريخ." />
      ) : null}

      {tab === 'cash'
        ? visible(cash, (book) => cashActive(book)).map((book) => (
            <OpsCard
              key={book.currency}
              title={`التدفقات النقدية — ${book.currency}`}
              chip="IAS 7 · غير مباشرة"
              badge={book.reconciled ? 'متطابقة' : 'فرق'}
            >
              <OpsTable>
                <tbody>
                  <CashRows book={book} />
                </tbody>
              </OpsTable>
              <p className="ops-note">
                الموجب تدفق داخل. أرباح الترجمة وخسائرها تُستبعد من التشغيل لأنها غير نقدية، ومركز العملات نشاط استثماري بعد استبعاد إعادة التقييم.
                أثر السعر على النقد يُعرض وحده. قيد إقفال السنة مستبعد لأنه نقل داخل حقوق الملكية.
                {Number(book.revaluationExcluded) !== 0
                  ? ` استُبعدت إعادة تقييم غير نقدية مقدارها ${money(absAmount(book.revaluationExcluded))} من الاستثمار.`
                  : ''}
              </p>
            </OpsCard>
          ))
        : null}

      {tab === 'equity'
        ? visible(equity, (book) => Number(book.opening) !== 0 || Number(book.profit) !== 0 || Number(book.capital) !== 0 || Number(book.retained) !== 0).map((book) => (
            <OpsCard key={book.currency} title={`التغير في حقوق الملكية — ${book.currency}`}>
              <OpsTable>
                <tbody>
                  <tr><td>الرصيد أول الفترة</td><td className="num">{money(book.opening)}</td></tr>
                  <tr><td>ربح الفترة</td><td className="num">{money(book.profit)}</td></tr>
                  <tr><td>حركة رأس المال</td><td className="num">{money(book.capital)}</td></tr>
                  {Number(book.retained) !== 0 ? <tr><td>حركة أرباح محتجزة أخرى</td><td className="num">{money(book.retained)}</td></tr> : null}
                  <tr><td>الرصيد آخر الفترة</td><td className="num">{money(book.closing)}</td></tr>
                </tbody>
              </OpsTable>
            </OpsCard>
          ))
        : null}

      {tab === 'trial'
        ? visible(trial, (book) => book.rows.length > 0).map((book) => (
            <OpsCard key={book.currency} title={`ميزان المراجعة — ${book.currency}`} badge={book.balanced ? 'متوازن' : 'غير متوازن'}>
              {book.rows.length ? (
                <OpsTable>
                  <thead>
                    <tr>
                      <th>الرمز</th>
                      <th>الحساب</th>
                      <th className="num">مدين</th>
                      <th className="num">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.rows.map((row) => (
                      <tr key={row.code}>
                        <td>{row.code}</td>
                        <td>{row.name}</td>
                        <td className="num">{money(row.debit)}</td>
                        <td className="num">{money(row.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>المجموع</td>
                      <td className="num">{money(book.totalDebit)}</td>
                      <td className="num">{money(book.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </OpsTable>
              ) : (
                <OpsEmpty title="لا قيود مرحّلة بهذه العملة حتى هذا التاريخ." />
              )}
            </OpsCard>
          ))
        : null}

      {tab === 'budget' ? (
        <>
          <OpsCard title="ميزانية مقابل الفعلي">
            <div className="ops-filter-bar">
              <div className="ops-filter-fields is-compact">
                <OpsField label="الميزانية">
                  <OpsSelect
                    value={budgetId}
                    onChange={setBudgetId}
                    placeholder="اختر ميزانية"
                    options={budgets.map((row) => ({ value: row.id, label: `${row.name} — ${row.year} ${row.currency} (${row.status === 'ACTIVE' ? 'معتمدة' : 'مسودة'})` }))}
                  />
                </OpsField>
              </div>
              <div className="ops-filter-actions">
                <OpsButton
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
                </OpsButton>
              </div>
            </div>
            {variance ? (
              variance.length ? (
                <OpsTable>
                  <thead>
                    <tr>
                      <th>الحساب</th>
                      <th>البند</th>
                      <th className="num">الميزانية</th>
                      <th className="num">الفعلي</th>
                      <th className="num">الفرق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variance.map((row) => (
                      <tr key={row.accountId}>
                        <td>{row.code} — {row.name}</td>
                        <td>{row.line}</td>
                        <td className="num">{money(row.budget)}</td>
                        <td className="num">{money(row.actual)}</td>
                        <td className="num">{money(row.variance)} {row.favorable ? 'موافق' : 'انحراف'}</td>
                      </tr>
                    ))}
                  </tbody>
                </OpsTable>
              ) : (
                <OpsEmpty title="لا بنود ميزانية داخل الفترة المحددة." />
              )
            ) : null}
          </OpsCard>
          {canWrite ? (
            <OpsCard title="ميزانية جديدة" chip="حسابات الإيراد والمصروف فقط">
              <div className="ops-form-grid">
                <OpsField label="الاسم">
                  <OpsInput value={budgetName} onChange={(event) => setBudgetName(event.target.value)} />
                </OpsField>
                <OpsField label="عملة الميزانية">
                  <OpsSelect
                    value={budgetCurrency}
                    onChange={(value) => setBudgetCurrency(value === 'SYP' ? 'SYP' : 'USD')}
                    options={[
                      { value: 'USD', label: 'دولار' },
                      { value: 'SYP', label: 'ليرة' },
                    ]}
                  />
                </OpsField>
                <OpsField label="الحساب">
                  <OpsSelect value={budgetAccount} onChange={setBudgetAccount} placeholder="اختر حساباً" options={pnlAccounts} />
                </OpsField>
                <OpsField label="الشهر">
                  <OpsSelect
                    value={budgetMonth}
                    onChange={setBudgetMonth}
                    options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
                  />
                </OpsField>
                <OpsField label="المبلغ">
                  <OpsInput inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} />
                </OpsField>
              </div>
              <div className="ops-form-actions">
                <OpsButton
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
                </OpsButton>
                <OpsButton variant="primary" className="is-action" onClick={() => void saveBudget()}>
                  حفظ المسودة
                </OpsButton>
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
                <div key={row.id} className="ops-inline-actions">
                  <span>{row.name}</span>
                  <OpsButton variant="primary" className="is-action" onClick={() => void setBudgetStatus(row.id, 'ACTIVE').then((next) => setBudgets((current) => current.map((item) => (item.year === next.year && item.currency === next.currency && item.id !== next.id && item.status === 'ACTIVE' ? { ...item, status: 'DRAFT' } : item.id === next.id ? next : item))))}>
                    اعتماد
                  </OpsButton>
                  <OpsButton variant="danger" className="is-action" onClick={() => void deleteBudget(row.id).then(() => setBudgets((current) => current.filter((item) => item.id !== row.id)))}>
                    حذف
                  </OpsButton>
                </div>
              ))}
            </OpsCard>
          ) : null}
        </>
      ) : null}

      {tab === 'periods' && canWrite ? (
        <OpsCard title="إعادة تقييم العملة الأجنبية" chip="سعر الإقفال">
          <p className="ops-note">
            يُعاد قياس مركز العملة الأجنبية المفتوح بسعر الإقفال (ليرة لكل دولار). الفرق يُرحَّل في العملة الوظيفية. الكمية لا تتغير، والتصحيح بالعكس.
          </p>
          <div className="ops-filter-bar">
            <div className="ops-filter-fields">
              <OpsField label="حتى تاريخ">
                <OpsInput type="date" value={revalDate} onChange={(event) => setRevalDate(event.target.value)} />
              </OpsField>
              <OpsField label="سعر الإقفال">
                <OpsInput inputMode="decimal" value={revalRate} placeholder="ل.س / دولار" onChange={(event) => setRevalRate(event.target.value)} />
              </OpsField>
            </div>
            <div className="ops-filter-actions">
              <OpsButton
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
              </OpsButton>
              <OpsButton
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
              </OpsButton>
              {canReopen ? (
                <OpsButton
                  variant="danger"
                  className="is-action"
                  onClick={() => void reverseFxRevaluation(revalDate).then(() => {
                    setRevalQuote(null);
                    push('عُكس تقييم هذا التاريخ.', 'ok');
                  }).catch((error) => push(masterErrorMessage(error), 'err'))}
                >
                  عكس
                </OpsButton>
              ) : null}
            </div>
          </div>
          {revalQuote ? (
            <p className="ops-note">
              كمية أجنبية {money(revalQuote.foreignQty)} — تكلفة {money(revalQuote.carrying)} {revalQuote.functionalCurrency} — قيمة الإقفال {money(revalQuote.closingValue)} — الفرق {money(revalQuote.gain)}
            </p>
          ) : null}
        </OpsCard>
      ) : null}

      {tab === 'periods' ? (
        <OpsCard
          title={`الفترات المالية ${from.slice(0, 4)}`}
          chip="إقفال الفترة يمنع الترحيل"
          toolbar={
            canReopen ? (
              <div className="ops-toolbar">
                <OpsButton variant="secondary" onClick={() => void closeFiscalYear(Number(from.slice(0, 4))).then(setPeriods).catch((error) => push(masterErrorMessage(error), 'err'))}>
                  إقفال السنة
                </OpsButton>
                <OpsButton variant="ghost" onClick={() => void reopenFiscalYear(Number(from.slice(0, 4))).then(setPeriods).catch((error) => push(masterErrorMessage(error), 'err'))}>
                  فتح السنة
                </OpsButton>
              </div>
            ) : null
          }
        >
          <OpsTable>
            <thead>
              <tr>
                <th>الشهر</th>
                <th>من</th>
                <th>إلى</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periods.map((row) => (
                <tr key={row.id}>
                  <td>{MONTHS[row.month - 1]}</td>
                  <td>{row.startsOn}</td>
                  <td>{row.endsOn}</td>
                  <td>{row.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}</td>
                  <td>
                    {canWrite && row.status === 'OPEN' ? (
                      <OpsButton variant="secondary" onClick={() => void closeFiscalPeriod(row.id).then((next) => setPeriods((current) => current.map((item) => (item.id === next.id ? next : item)))).catch((error) => push(masterErrorMessage(error), 'err'))}>
                        إقفال
                      </OpsButton>
                    ) : null}
                    {canReopen && row.status === 'CLOSED' ? (
                      <OpsButton variant="ghost" onClick={() => void reopenFiscalPeriod(row.id).then((next) => setPeriods((current) => current.map((item) => (item.id === next.id ? next : item)))).catch((error) => push(masterErrorMessage(error), 'err'))}>
                        إعادة فتح
                      </OpsButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </OpsTable>
        </OpsCard>
      ) : null}
    </div>
  );
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

function CashRows({ book }: { book: CashFlowBook }) {
  const rows: { key: string; name: string; amount: string; kind: 'section' | 'detail' | 'total' }[] = [
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
  return rows.map((row) => (
    <tr key={row.key} className={row.kind === 'section' ? 'is-section' : row.kind === 'total' ? 'is-total' : 'is-detail'}>
      <td>{row.name}</td>
      <td className="num">{row.kind === 'section' ? '' : money(row.amount)}</td>
    </tr>
  ));
}

function visible<T>(rows: T[], has: (row: T) => boolean) {
  const active = rows.filter(has);
  return active.length ? active : [];
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
  if (!rows.length) return <OpsEmpty title={`لا حركة في ${title}.`} />;
  return (
    <OpsTable>
      <thead>
        <tr>
          <th>{title}</th>
          <th className="num">المبلغ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.code}>
            <td>{row.name}</td>
            <td className="num">{money(row.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>{totalLabel}</td>
          <td className="num">{money(total)}</td>
        </tr>
      </tfoot>
    </OpsTable>
  );
}
