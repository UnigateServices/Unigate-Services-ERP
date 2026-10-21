'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PrintButton } from './print/print-layout';
import { AuthUser, EmployeeRow, ReportDoc, runReport } from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Input } from './ui/field';
import { StatCard, StatGrid } from './ui/stat-card';
import { Select } from './ui/select';

type Kind = 'all' | 'income' | 'outcome' | 'transfer' | 'exchange' | 'advance';
type Preset = 'today' | 'week' | 'month' | 'custom';

type Line = {
  date: string;
  type: string;
  reference: string;
  employee: string;
  detail: string;
  currency: string;
  amount: number | null;
  status: string;
};

type Props = {
  actor: AuthUser;
  employees?: EmployeeRow[];
};

const KINDS: { value: Kind; label: string; reportId: string }[] = [
  { value: 'all', label: 'الكل', reportId: 'overview' },
  { value: 'income', label: 'وارد', reportId: 'income' },
  { value: 'outcome', label: 'صادر', reportId: 'outcome' },
  { value: 'transfer', label: 'تحويل بين صناديق', reportId: 'transfer' },
  { value: 'exchange', label: 'تصريف عملات', reportId: 'exchange' },
  { value: 'advance', label: 'سلف', reportId: 'advances' },
];

const FUNDS = [
  { value: '', label: 'الكل' },
  { value: 'VAULT', label: 'الخزنة' },
  { value: 'SHAM_CASH', label: 'شام كاش' },
  { value: 'BANK', label: 'البنوك' },
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function weekStart() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return iso(date);
}

function text(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function num(value: string | number | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function money(amount: number, currency: string) {
  const digits = currency.includes('ليرة') || currency === 'SYP' ? 0 : 2;
  const textValue = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount < 0 ? `(${textValue})` : textValue;
}

function linesOf(kind: Kind, doc: ReportDoc): Line[] {
  const section = doc.sections.find((item) => item.id === 'rows') ?? doc.sections[0];
  if (!section) return [];
  return section.rows.map((row) => {
    if (kind === 'income' || kind === 'outcome') {
      return {
        date: text(row.date),
        type: kind === 'income' ? 'وارد' : 'صادر',
        reference: text(row.reference),
        employee: text(row.employee),
        detail: [row.fund, row.party, row.project].map((item) => text(item)).filter((item) => item !== '—').join(' · ') || '—',
        currency: text(row.currency),
        amount: num(row.total),
        status: text(row.status),
      };
    }
    if (kind === 'exchange') {
      return {
        date: text(row.date),
        type: 'تصريف',
        reference: text(row.reference),
        employee: text(row.employee),
        detail: `${text(row.fund)} · ${text(row.type)} · مدفوع ${text(row.paid)} · مستلم ${text(row.recv)}`,
        currency: '—',
        amount: null,
        status: text(row.status),
      };
    }
    if (kind === 'transfer') {
      return {
        date: text(row.date),
        type: 'تحويل',
        reference: text(row.reference),
        employee: text(row.employee),
        detail: `${text(row.from)} → ${text(row.to)}${row.borrower && row.borrower !== '—' ? ` · ${text(row.borrower)}` : ''}`,
        currency: text(row.currency),
        amount: num(row.amount),
        status: text(row.status),
      };
    }
    if (kind === 'advance') {
      return {
        date: text(row.date),
        type: 'سلف',
        reference: text(row.reference),
        employee: text(row.employee),
        detail: [row.borrower, row.type, row.project].map((item) => text(item)).filter((item) => item !== '—').join(' · ') || '—',
        currency: text(row.currency),
        amount: num(row.total),
        status: text(row.status),
      };
    }
    return {
      date: text(row.date),
      type: text(row.type),
      reference: text(row.reference),
      employee: text(row.employee),
      detail: text(row.route),
      currency: text(row.currency),
      amount: num(row.amount),
      status: text(row.status),
    };
  });
}

function signed(line: Line) {
  if (line.amount == null) return 0;
  if (line.type === 'وارد') return line.amount;
  if (line.type === 'صادر' || line.type === 'سلف') return -line.amount;
  return 0;
}

function NumList({ entries }: { entries: [string, number][] }) {
  if (entries.length === 0) return <span dir="ltr" className="cash-num">0</span>;
  return (
    <>
      {entries.map(([currency, amount]) => (
        <div key={currency} dir="ltr" className="cash-num">
          {money(amount, currency)} {currency}
        </div>
      ))}
    </>
  );
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function CashReportPanel({ actor, employees = [] }: Props) {
  const canPickEmployee = actor.role !== 'EMPLOYEE';
  const [kind, setKind] = useState<Kind>('all');
  const [fund, setFund] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [activeKind, setActiveKind] = useState<Kind>('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const lines = useMemo(() => (doc ? linesOf(activeKind, doc) : []), [doc, activeKind]);
  const nets = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (!line.currency || line.currency === '—') continue;
      totals.set(line.currency, (totals.get(line.currency) || 0) + signed(line));
    }
    return [...totals.entries()];
  }, [lines]);

  const summary = useMemo(() => {
    const receipts = new Map<string, number>();
    const payments = new Map<string, number>();
    const net = new Map<string, number>();
    for (const line of lines) {
      if (line.amount == null || !line.currency || line.currency === '—') continue;
      const delta = signed(line);
      if (delta > 0) receipts.set(line.currency, (receipts.get(line.currency) || 0) + delta);
      if (delta < 0) payments.set(line.currency, (payments.get(line.currency) || 0) - delta);
      net.set(line.currency, (net.get(line.currency) || 0) + delta);
    }
    return { receipts: [...receipts.entries()], payments: [...payments.entries()], net: [...net.entries()] };
  }, [lines]);

  const columns: Column<Line>[] = [
    { key: 'date', header: 'التاريخ', render: (line) => <span dir="ltr" className="cash-num">{line.date}</span> },
    { key: 'type', header: 'النوع', render: (line) => <Badge tone={line.type === 'وارد' ? 'ok' : line.type === 'صادر' || line.type === 'سلف' ? 'danger' : 'info'}>{line.type}</Badge> },
    { key: 'reference', header: 'المرجع', render: (line) => <span dir="ltr" className="cash-num">{line.reference}</span> },
    { key: 'employee', header: 'الموظف', defaultHidden: true, render: (line) => line.employee },
    { key: 'detail', header: 'البيان', render: (line) => line.detail },
    { key: 'currency', header: 'العملة', render: (line) => line.currency },
    {
      key: 'amount',
      header: 'المبلغ',
      numeric: true,
      render: (line) => (
        <span dir="ltr" className="cash-num">
          {line.amount == null ? '—' : money(line.amount, line.currency)}
        </span>
      ),
    },
    { key: 'status', header: 'الحالة', render: (line) => line.status },
  ];

  async function onRun(event?: FormEvent) {
    event?.preventDefault();
    const report = KINDS.find((item) => item.value === kind);
    if (!report) return;
    let start = from;
    let end = to;
    if (start > end) {
      start = to;
      end = from;
    }
    setLoading(true);
    setMessage('');
    try {
      const result = await runReport({
        reportId: report.reportId,
        period: preset === 'custom' ? 'custom' : preset,
        from: preset === 'custom' ? start : undefined,
        to: preset === 'custom' ? end : undefined,
        employeeId: canPickEmployee && employeeId ? employeeId : undefined,
        fund: fund || undefined,
        status: 'ALL',
      });
      setDoc(result);
      setActiveKind(kind);
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void onRun();
  }, []);

  function applyPreset(next: Exclude<Preset, 'custom'>) {
    setPreset(next);
    if (next === 'today') {
      const day = todayIso();
      setFrom(day);
      setTo(day);
    } else if (next === 'week') {
      setFrom(weekStart());
      setTo(todayIso());
    } else {
      setFrom(monthStart());
      setTo(todayIso());
    }
  }

  function exportCsv() {
    if (!doc) return;
    const header = ['التاريخ', 'النوع', 'المرجع', 'الموظف', 'البيان', 'العملة', 'المبلغ', 'الحالة'];
    const body = lines.map((line) =>
      [line.date, line.type, line.reference, line.employee, line.detail, line.currency, line.amount ?? '', line.status]
        .map((value) => csvCell(String(value)))
        .join(','),
    );
    const totals = [
      '',
      'الإجماليات',
      ...doc.kpis.map((item) => csvCell(`${item.label}: ${item.format === 'money' ? money(item.value, item.currency || '') : item.value}`)),
    ];
    const blob = new Blob(['\ufeff', [header.join(','), ...body, totals.join(',')].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'كشف-حركة-النقدية.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ui-page ui-wide cash-report rpt-shell">
      <form className="rpt-chrome" onSubmit={(event) => void onRun(event)}>
        <Card title="كشف حركة النقدية" chip="تصفية">
          <div className="cash-filters">
            <label className="rpt-field">
              نوع الحركة
              <Select
                value={kind}
                onChange={(value) => setKind(value as Kind)}
                options={KINDS.map((item) => ({ value: item.value, label: item.label }))}
              />
            </label>
            <label className="rpt-field">
              الصندوق / الحساب
              <Select value={fund} onChange={setFund} options={FUNDS} />
            </label>
            {canPickEmployee ? (
              <label className="rpt-field">
                الموظف المسؤول
                <Select
                  value={employeeId}
                  onChange={setEmployeeId}
                  options={[{ value: '', label: 'الكل' }, ...employees.map((row) => ({ value: row.id, label: row.name }))]}
                />
              </label>
            ) : null}
            <label className="rpt-field">
              من تاريخ
              <Input
                type="date"
                value={from}
                onChange={(event) => {
                  setPreset('custom');
                  setFrom(event.target.value);
                }}
              />
            </label>
            <label className="rpt-field">
              إلى تاريخ
              <Input
                type="date"
                value={to}
                onChange={(event) => {
                  setPreset('custom');
                  setTo(event.target.value);
                }}
              />
            </label>
          </div>
          <div className="cash-row"><div className="rpt-period-line cash-period">
            <span className="rpt-period-label">النطاق</span>
            <div className="rpt-pills">
              {(
                [
                  ['today', 'اليوم'],
                  ['week', 'هذا الأسبوع'],
                  ['month', 'هذا الشهر'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={`rpt-pill${preset === id ? ' is-on' : ''}`} onClick={() => applyPreset(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {fund ? <p className="cash-note">تصفية الصندوق تشمل الوارد والصادر والتصريف والتحويل. السلف لا ترتبط بصندوق فتبقى مع كل الصناديق.</p> : null}
          <div className="cash-actions-inline">
            <Button variant="submit" type="submit" disabled={loading}>
              {loading ? 'جاري الإعداد...' : 'عرض الكشف'}
            </Button>
            <PrintButton
              variant="soft"
              disabled={!doc}
              getDoc={() =>
                doc
                  ? {
                      title: 'كشف حركة النقدية',
                      number: doc.periodLabel || '—',
                      date: doc.from && doc.to ? `${doc.from} — ${doc.to}` : todayIso(),
                      currency: '—',
                      total: String(lines.length),
                      partyLabel: 'عدد الحركات',
                      partyName: String(lines.length),
                      totals: doc.kpis.map((k) => [k.label, k.format === 'money' ? money(Number(k.value), k.currency || '') : String(k.value)] as [string, string]),
                      lines: lines.map((l) => ({ name: `${l.date} · ${l.reference} · ${l.detail}`, total: l.amount === null ? '—' : `${money(l.amount, l.currency)} ${l.currency}` })),
                      notes: doc.notes.map(String).join(' · '),
                      signatures: ['المحاسب', 'المدير المالي'],
                    }
                  : null
              }
            />
            <Button variant="soft" type="button" disabled={!doc} onClick={exportCsv}>
              تصدير
            </Button>
          </div>
          </div>{message ? <p className="ui-log-empty">{message}</p> : null}
        </Card>
      </form>

      {!doc ? (
        <p className="rpt-empty">{loading ? 'جاري إعداد الكشف...' : 'اختر التصفية ثم اضغط «عرض الكشف».'}</p>
      ) : (
        <div className="rpt-result" id="cashPrintRoot">
          <section className="card rpt-letterhead">
            <h2>كشف حركة النقدية</h2>
            <p>
              {doc.periodLabel}
              {doc.from && doc.to ? ` · ${doc.from} — ${doc.to}` : ''}
            </p>
          </section>
          <StatGrid>
            <StatCard label="عدد الحركات" value={<span dir="ltr" className="cash-num">{lines.length.toLocaleString('en-US')}</span>} hint={doc.periodLabel} />
            <StatCard label="إجمالي المقبوضات" value={<NumList entries={summary.receipts} />} />
            <StatCard label="إجمالي المدفوعات" value={<NumList entries={summary.payments} />} />
            <StatCard label="الرصيد الختامي" value={<NumList entries={summary.net} />} hint="صافي حركة الفترة" />
          </StatGrid>
          <Card title="الحركات" count={lines.length}>
            <DataTable
              tableId="cash-statement"
              columns={columns}
              rows={lines}
              rowKey={(line) => `${line.reference}|${line.date}|${line.type}|${line.detail}|${line.amount}`}
              empty="لا حركات مطابقة للتصفية."
            />
            {nets.length > 0 ? (
              <p className="cash-note">
                الصافي الظاهر في الجدول (وارد − صادر − سلف):{' '}
                {nets.map(([currency, amount]) => `${currency} ${money(amount, currency)}`).join(' · ')}
                . التحويل والتصريف لا يدخلان في هذا الصافي.
              </p>
            ) : null}
            {doc.notes.map((item) => (
              <p key={item} className="cash-note">
                {item}
              </p>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
