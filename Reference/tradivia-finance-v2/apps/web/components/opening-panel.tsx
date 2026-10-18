'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CurrencyMark, CurrencySelect } from './currency-mark';
import { OpsCard } from './ops-card';
import { OpsDialog } from './ops-dialog';
import { OpsSelect } from './ops-select';
import {
  ApiError,
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  EmployeeRow,
  FundsSnapshot,
  OPENING_FUNDS,
  OpeningRow,
  OpeningSearch,
  OperationFund,
  createOpening,
  deleteOpening,
  listOpenings,
} from '../lib/api';
import { Dictionary, dictionary, fill } from '../lib/i18n';
import { masterErrorMessage } from '../lib/master-errors';
import { useLang } from '../lib/use-lang';

type Props = {
  actor: AuthUser;
  employees: EmployeeRow[];
  openings: OpeningRow[];
  funds?: FundsSnapshot | null;
  onChanged: () => Promise<void>;
  part?: 'form' | 'log';
};

type Toast = { id: number; text: string; tone: 'ok' | 'err' };

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function signedAmount(amount: number, digits: number) {
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount < 0 ? `(${text})` : text;
}

function money(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  const digits = currency === 'SYP' ? 0 : 2;
  return signedAmount(amount, digits);
}

function fundLabel(fund: string, t: Dictionary['opening']) {
  if (fund === 'SHAM_CASH') return t.fundSham;
  if (fund === 'VAULT') return t.fundVault;
  return fund;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function clockTime(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function sectionError(error: unknown, t: Dictionary['opening']) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code || '') : '';
  const map: Record<string, string> = {
    AMOUNT_INVALID: t.errAmount,
    OPENING_NOT_FOUND: t.errMissing,
    FORBIDDEN: t.errForbidden,
    EMPLOYEE_NOT_FOUND: t.noPeople,
  };
  return map[code] || masterErrorMessage(error);
}

function peopleUnder(actor: AuthUser, employees: EmployeeRow[]) {
  const active = employees.filter((row) => row.accountStatus === 'ACTIVE');
  if (actor.role === 'SUPERVISOR') return active.filter((row) => row.role === 'EMPLOYEE');
  return active;
}

function BalanceChips({ rows }: { rows: { currency: CurrencyCode; amount: number }[] }) {
  const t = dictionary(useLang()).opening;
  if (rows.length === 0) return <span className="ops-bal-empty">{t.noCurrencies}</span>;
  return (
    <div className="ops-bal-chips">
      {rows.map((row) => (
        <div key={row.currency} className="ops-bal-chip">
          <span className={`ops-bal-amt${row.amount < 0 ? ' is-neg' : ' is-pos'}`}>{money(row.amount, row.currency)}</span>
          <CurrencyMark code={row.currency} />
        </div>
      ))}
    </div>
  );
}

function receiptLines(row: OpeningRow, t: Dictionary['opening']) {
  const lines: Array<[string, string]> = [
    [t.opNo, String(row.operationNumber)],
    [t.colDate, dateOnly(String(row.transactionDate))],
    [t.employee, row.employee.name],
    [t.fund, fundLabel(row.fund, t)],
    [t.currency, row.currency === 'SYP' ? t.syp : t.usd],
  ];
  if (row.fxRate != null && row.fxRate !== '') lines.push(['سعر الصرف', String(Number(row.fxRate))]);
  lines.push([t.amount, money(row.amount, row.currency)]);
  return lines;
}

function receiptText(row: OpeningRow, t: Dictionary['opening']) {
  return ['TRADIVIA', t.receiptLine, ...receiptLines(row, t).map(([label, value]) => `${label}: ${value}`)].join('\n');
}

function ReceiptSheet({ row, onClose }: { row: OpeningRow; onClose: () => void }) {
  const t = dictionary(useLang()).opening;
  return (
    <OpsDialog
      title="TRADIVIA"
      onClose={onClose}
      closeLabel={t.close}
      className="receipt-sheet"
      footer={
        <>
          <button
            type="button"
            className="receipt-choice is-wa"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(receiptText(row, t))}`, '_blank', 'noopener,noreferrer')}
          >
            {t.wa}
          </button>
          <button type="button" className="receipt-choice is-print" onClick={() => window.print()}>{t.print}</button>
        </>
      }
    >
      <div className="receipt-brand">
        <span>{t.receiptLine} · {t.opNo} {row.operationNumber}</span>
      </div>
      <dl className="receipt-lines">
        <div><dt>{t.colDate}</dt><dd>{dateOnly(String(row.transactionDate))}</dd></div>
        <div><dt>{t.employee}</dt><dd>{row.employee.name}</dd></div>
        <div><dt>{t.fund}</dt><dd>{fundLabel(row.fund, t)}</dd></div>
        <div><dt>{t.currency}</dt><dd><CurrencyMark code={row.currency} /></dd></div>
        {row.fxRate != null && row.fxRate !== '' ? <div><dt>سعر الصرف</dt><dd>{Number(row.fxRate)}</dd></div> : null}
        <div><dt>{t.amount}</dt><dd className={Number(row.amount) < 0 ? 'is-neg' : undefined}>{money(row.amount, row.currency)}</dd></div>
      </dl>
    </OpsDialog>
  );
}

export function OpeningPanel({ actor, employees, openings, funds, onChanged, part = 'form' }: Props) {
  const t = dictionary(useLang()).opening;
  const targets = useMemo(() => peopleUnder(actor, employees), [actor, employees]);
  const [employeeId, setEmployeeId] = useState(targets[0]?.id || '');
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [fund, setFund] = useState<OperationFund>('VAULT');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [fxRate, setFxRate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<OpeningRow | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const [loaded, setLoaded] = useState<OpeningRow[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState(false);
  const [viewing, setViewing] = useState<OpeningRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<OpeningRow | null>(null);
  const [cancelChoice, setCancelChoice] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const searchRef = useRef<OpeningSearch>({ from: todayIso(), to: todayIso() });
  const [dbFrom, setDbFrom] = useState(todayIso());
  const [dbTo, setDbTo] = useState(todayIso());
  const [dbFund, setDbFund] = useState('');
  const [dbCurrency, setDbCurrency] = useState('');
  const [dbEmployee, setDbEmployee] = useState('');
  const [dbNotes, setDbNotes] = useState('');
  const [dbOperation, setDbOperation] = useState('');
  const [dbMin, setDbMin] = useState('');
  const [dbMax, setDbMax] = useState('');
  const [fundFilter, setFundFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'new' | 'old'>('new');
  const [query, setQuery] = useState('');

  function pushToast(text: string, tone: 'ok' | 'err') {
    const id = toastSeq.current + 1;
    toastSeq.current = id;
    setToasts((list) => [...list, { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3200);
  }

  useEffect(() => {
    if (!targets.some((row) => row.id === employeeId) && targets[0]) setEmployeeId(targets[0].id);
  }, [targets, employeeId]);

  const nextOperationNumber = useMemo(() => {
    const mine = openings.filter((row) => row.employee.id === employeeId);
    return mine.reduce((max, row) => Math.max(max, row.operationNumber), 0) + 1;
  }, [openings, employeeId]);

  const amountNum = Number(amount);
  const snapshot: FundsSnapshot = funds || { vault: [], sham: [], banks: [], advances: [] };

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = loaded.filter((row) => {
      if (fundFilter && row.fund !== fundFilter) return false;
      if (currencyFilter && row.currency !== currencyFilter) return false;
      if (employeeFilter && row.employee.id !== employeeFilter) return false;
      if (!text) return true;
      const haystack = [row.reference, String(row.operationNumber), row.employee.name, row.notes, fundLabel(row.fund, t)].join(' ').toLowerCase();
      return haystack.includes(text);
    });
    rows.sort((a, b) => {
      const delta = dateOnly(String(a.transactionDate)).localeCompare(dateOnly(String(b.transactionDate))) || a.operationNumber - b.operationNumber;
      return sortOrder === 'new' ? -delta : delta;
    });
    return rows;
  }, [loaded, fundFilter, currencyFilter, employeeFilter, sortOrder, query, t]);

  const displayFiltersOn = Boolean(fundFilter || currencyFilter || employeeFilter || query || sortOrder !== 'new');

  function clearDisplayFilters() {
    setFundFilter('');
    setCurrencyFilter('');
    setEmployeeFilter('');
    setSortOrder('new');
    setQuery('');
  }

  async function loadLog(search: OpeningSearch) {
    searchRef.current = search;
    setLoadingLog(true);
    try {
      setLoaded(await listOpenings(search));
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    } finally {
      setLoadingLog(false);
    }
  }

  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setAdvancedOpen(false);
    const day = todayIso();
    const untouched = dbFrom === day && dbTo === day && !dbFund && !dbCurrency && !dbEmployee && !dbNotes.trim() && !dbOperation.trim() && !dbMin.trim() && !dbMax.trim();
    setCustomSearch(!untouched);
    void loadLog({
      from: dbFrom,
      to: dbTo,
      fund: dbFund,
      currency: dbCurrency,
      employeeId: dbEmployee,
      notes: dbNotes,
      operationNumber: dbOperation,
      minAmount: dbMin,
      maxAmount: dbMax,
    });
  }

  function showToday() {
    const day = todayIso();
    setAdvancedOpen(false);
    setCustomSearch(false);
    setDbFrom(day);
    setDbTo(day);
    setDbFund('');
    setDbCurrency('');
    setDbEmployee('');
    setDbNotes('');
    setDbOperation('');
    setDbMin('');
    setDbMax('');
    clearDisplayFilters();
    void loadLog({ from: day, to: day });
  }

  useEffect(() => {
    if (part !== 'log') return;
    void loadLog(searchRef.current);
  }, [part, openings]);

  function resetForm() {
    setTransactionDate(todayIso());
    setAmount('');
    setNotes('');
    setFund('VAULT');
    setCurrency('USD');
    setFxRate('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      pushToast(t.errAmount, 'err');
      return;
    }
    if (currency === 'SYP' && !(Number(fxRate) > 0)) {
      pushToast(masterErrorMessage(new ApiError('FX_RATE_REQUIRED', 'FX_RATE_REQUIRED')), 'err');
      return;
    }
    setSaving(true);
    try {
      const row = await createOpening({
        transactionDate,
        employeeId,
        fund,
        currency,
        amount: amountNum,
        notes,
        ...(currency === 'SYP' ? { fxRate: Number(fxRate) } : {}),
      });
      resetForm();
      setLastReceipt(row);
      setReceiptOpen(true);
      pushToast(fill(t.saved, { ref: row.reference, n: row.operationNumber }), 'ok');
      await onChanged();
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    const reason = (cancelChoice === 'other' ? deleteReason : cancelChoice).trim();
    if (!reason) {
      pushToast(t.reasonRequired, 'err');
      return;
    }
    try {
      await deleteOpening(deleteRow.id);
      pushToast(t.deleted, 'ok');
      setDeleteRow(null);
      setCancelChoice('');
      setDeleteReason('');
      await onChanged();
    } catch (error) {
      pushToast(sectionError(error, t), 'err');
    }
  }

  return (
    <div className="ops-page">
      {part === 'form' ? (
        <>
          <div className="ops-bal-grid">
            <OpsCard title={t.vault} chip={t.box} collapsible>
              <BalanceChips rows={snapshot.vault} />
            </OpsCard>
            <OpsCard title={t.sham} chip={t.app} collapsible>
              <BalanceChips rows={snapshot.sham} />
            </OpsCard>
          </div>
          <OpsCard
            title={t.newOp}
            badge={`${t.opNo} ${nextOperationNumber}`}
            collapsible
            toolbar={
              <>
                <button type="button" className="ops-tool-btn ops-last-receipt-btn" onClick={() => (lastReceipt ? setReceiptOpen(true) : pushToast(t.noReceipt, 'err'))}>
                  {t.lastReceipt}
                  {lastReceipt ? <span className="ops-last-receipt-num">#{lastReceipt.operationNumber}</span> : null}
                </button>
                <span className="ops-date">{transactionDate}</span>
              </>
            }
          >
            {targets.length === 0 ? (
              <p className="ops-log-empty">{t.noPeople}</p>
            ) : (
              <form onSubmit={onSubmit}>
                <div className="ops-form-grid">
                  <div className="form-group">
                    <label className="form-label">{t.employee}</label>
                    <OpsSelect value={employeeId} onChange={setEmployeeId} options={targets.map((row) => ({ value: row.id, label: row.name }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t.txDate}</label>
                    <input className="form-control" required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t.fund}</label>
                    <OpsSelect value={fund} onChange={(next) => setFund(next as OperationFund)} options={OPENING_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t.currency}</label>
                    <CurrencySelect value={currency} onChange={setCurrency} />
                  </div>
                  {currency === 'SYP' ? (
                    <div className="form-group">
                      <label className="form-label">سعر الصرف</label>
                      <input className="form-control" inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} />
                    </div>
                  ) : null}
                  <div className="form-group">
                    <label className="form-label">{t.amount}</label>
                    <input className="form-control input-amount" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t.notes}</label>
                    <input className="form-control" value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </div>
                </div>
                <div className="ops-action-row">
                  <div className="ops-total-box">
                    <div className="ops-total-label">{t.amount}</div>
                    <div className={`ops-total-value${amountNum < 0 ? ' is-neg' : ''}`}>
                      <span>{amount && amountNum !== 0 ? money(amountNum, currency) : '0.00'}</span>
                      <CurrencyMark code={currency} />
                    </div>
                  </div>
                  <button type="submit" className="btn-submit-action ops-submit-btn" disabled={saving || !employeeId || !amount || amountNum === 0}>
                    {t.save}
                  </button>
                </div>
              </form>
            )}
          </OpsCard>
          {receiptOpen && lastReceipt ? <ReceiptSheet row={lastReceipt} onClose={() => setReceiptOpen(false)} /> : null}
        </>
      ) : (
        <OpsCard title={t.log}>
          <div className="ops-log-tools">
            <button type="button" className="ops-log-advanced-toggle" onClick={() => setAdvancedOpen(true)}><span>{t.advancedSearch}</span></button>
            {customSearch ? <button type="button" className="ops-log-advanced-toggle" onClick={showToday}>{t.resetSearch}</button> : null}
            <button type="button" className="ops-log-advanced-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
              <span>{t.filter}</span><span aria-hidden="true">{filtersOpen ? '▴' : '▾'}</span>
            </button>
            {displayFiltersOn ? <button type="button" className="btn-ghost ops-log-clear" onClick={clearDisplayFilters}>{t.clearFilters}</button> : null}
          </div>
          {advancedOpen ? (
            <OpsDialog title={t.advancedSearch} onClose={() => setAdvancedOpen(false)} closeLabel={t.close} wide>
              <form className="ops-search-modal" onSubmit={runSearch}>
                <div className="form-group"><label className="form-label">{t.fromDate}</label><input className="form-control" type="date" value={dbFrom} onChange={(event) => setDbFrom(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.toDate}</label><input className="form-control" type="date" value={dbTo} onChange={(event) => setDbTo(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.employee}</label><OpsSelect value={dbEmployee} onChange={setDbEmployee} options={[{ value: '', label: t.all }, ...targets.map((row) => ({ value: row.id, label: row.name }))]} /></div>
                <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={dbFund} onChange={setDbFund} options={[{ value: '', label: t.all }, ...OPENING_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
                <div className="form-group"><label className="form-label">{t.currency}</label><OpsSelect value={dbCurrency} onChange={setDbCurrency} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
                <div className="form-group"><label className="form-label">{t.notes}</label><input className="form-control" value={dbNotes} onChange={(event) => setDbNotes(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.opNo}</label><input className="form-control" inputMode="numeric" value={dbOperation} onChange={(event) => setDbOperation(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.rangeFrom}</label><input className="form-control" inputMode="decimal" value={dbMin} onChange={(event) => setDbMin(event.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t.rangeTo}</label><input className="form-control" inputMode="decimal" value={dbMax} onChange={(event) => setDbMax(event.target.value)} /></div>
                <div className="ops-log-search-actions"><button type="submit" className="btn" disabled={loadingLog}>{loadingLog ? t.searching : t.runSearch}</button></div>
              </form>
            </OpsDialog>
          ) : null}
          <div className={`ops-log-collapse${filtersOpen ? ' is-open' : ''}`}>
            <div className="ops-log-collapse-inner">
              <div className="ops-log-quick is-register">
                <div className="form-group"><label className="form-label">{t.order}</label><OpsSelect value={sortOrder} onChange={(next) => setSortOrder(next as 'new' | 'old')} options={[{ value: 'new', label: t.newest }, { value: 'old', label: t.oldest }]} /></div>
                <div className="form-group"><label className="form-label">{t.employee}</label><OpsSelect value={employeeFilter} onChange={setEmployeeFilter} options={[{ value: '', label: t.all }, ...targets.map((row) => ({ value: row.id, label: row.name }))]} /></div>
                <div className="form-group"><label className="form-label">{t.fund}</label><OpsSelect value={fundFilter} onChange={setFundFilter} options={[{ value: '', label: t.all }, ...OPENING_FUNDS.map((item) => ({ value: item.value, label: fundLabel(item.value, t) }))]} /></div>
                <div className="form-group"><label className="form-label">{t.currency}</label><OpsSelect value={currencyFilter} onChange={setCurrencyFilter} options={[{ value: '', label: t.all }, ...CURRENCIES.map((item) => ({ value: item.value, label: <CurrencyMark code={item.value} /> }))]} /></div>
              </div>
            </div>
          </div>
          <div className="ops-log-live-search"><input className="form-control" value={query} placeholder={t.searchPh} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="ops-log-count-line">{loadingLog ? t.searching : fill(t.shownCount, { n: visible.length })}</div>
          {visible.length === 0 ? (
            <p className="ops-log-empty">{loaded.length === 0 ? t.emptyRange : t.noResults}</p>
          ) : (
            <div className="ops-table-wrap">
              <table className="premium-table ops-log-table">
                <thead>
                  <tr>
                    <th>{t.opNo}</th>
                    <th>{t.colDate}</th>
                    <th>{t.employee}</th>
                    <th>{t.fund}</th>
                    <th>{t.currency}</th>
                    <th>{t.amount}</th>
                    <th>{t.notes}</th>
                    <th>{t.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td>{row.operationNumber}</td>
                      <td>
                        <span className="ops-log-date">{dateOnly(String(row.transactionDate))}</span>
                        {clockTime(row.systemDate) ? <span className="ops-log-clock">{clockTime(row.systemDate)}</span> : null}
                      </td>
                      <td>{row.employee.name}</td>
                      <td>{fundLabel(row.fund, t)}</td>
                      <td><CurrencyMark code={row.currency} /></td>
                      <td><span className="ops-log-num">{money(row.amount, row.currency)}</span></td>
                      <td className="ops-log-note">{row.notes || '—'}</td>
                      <td>
                        <div className="ops-log-actions">
                          <button type="button" className="ops-mini-btn" onClick={() => setViewing(row)}>{t.print}</button>
                          <button type="button" className="ops-mini-btn is-danger" onClick={() => { setDeleteRow(row); setCancelChoice(''); setDeleteReason(''); }}>{t.cancelOp}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {viewing ? <ReceiptSheet row={viewing} onClose={() => setViewing(null)} /> : null}
          {deleteRow ? (
            <OpsDialog title={t.deleteTitle} onClose={() => setDeleteRow(null)} closeLabel={t.close} danger>
              <div className="form-group">
                <label className="form-label">{t.cancelQuick}</label>
                <OpsSelect
                  value={cancelChoice}
                  placeholder={t.pickReason}
                  onChange={setCancelChoice}
                  options={[
                    { value: '', label: t.pickReason },
                    { value: t.reasonAmount, label: t.reasonAmount },
                    { value: t.reasonCurrency, label: t.reasonCurrency },
                    { value: t.reasonCustomer, label: t.reasonCustomer },
                    { value: 'other', label: t.reasonOther },
                  ]}
                />
              </div>
              {cancelChoice === 'other' ? (
                <div className="form-group">
                  <label className="form-label">{t.reasonLabel}</label>
                  <textarea className="form-control ops-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} rows={3} />
                </div>
              ) : null}
              <div className="ops-cancel-actions">
                <button type="button" className="ops-cancel-dismiss" onClick={() => setDeleteRow(null)}>{t.cancelOp}</button>
                <button type="button" className="ops-cancel-send" onClick={() => void confirmDelete()}>{t.confirmCancel}</button>
              </div>
            </OpsDialog>
          ) : null}
        </OpsCard>
      )}
      <div className="ops-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`ops-toast${item.tone === 'err' ? ' is-err' : ''}`} role="status">{item.text}</div>
        ))}
      </div>
    </div>
  );
}
