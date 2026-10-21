'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileViewer } from './file-viewer';
import { CurrencyMark } from './currency-mark';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { Select } from './ui/select';
import {
  ADVANCE_TYPES,
  AuthUser,
  EmployeeRow,
  EXCHANGE_TYPES,
  MONITOR_TYPES,
  MonitorRow,
  MonitorType,
  OPERATION_FUNDS,
  attachmentCount,
  listMonitor,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';

type Props = {
  actor: AuthUser;
  employees: EmployeeRow[];
};

const EMPTY_COUNTS: Record<MonitorType, number> = {
  INCOME: 0,
  OUTCOME: 0,
  EXCHANGE: 0,
  TRANSFER: 0,
  ADVANCE: 0,
};

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateOnly(value: string) {
  return String(value || '').slice(0, 10);
}

function clockTime(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function money(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  const digits = currency === 'SYP' ? 0 : 2;
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return amount < 0 ? `(${text})` : text;
}

function fundLabel(fund?: string) {
  return OPERATION_FUNDS.find((item) => item.value === fund)?.label || fund || '—';
}

function statusLabel(status: string) {
  if (status === 'COMPLETED') return 'مكتملة';
  if (status === 'PENDING_APPROVAL') return 'بانتظار الموافقة';
  return status;
}

function peopleUnder(actor: AuthUser, employees: EmployeeRow[]) {
  const active = employees.filter((row) => row.accountStatus === 'ACTIVE');
  if (actor.role === 'SUPERVISOR') return active.filter((row) => row.role === 'EMPLOYEE');
  return active.filter((row) => row.role !== 'MONITOR');
}

function StaffPeopleSelect({
  team,
  selected,
  onChange,
}: {
  team: EmployeeRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const all = selected.length === 0;
  const label = all
    ? 'الكل'
    : selected.length === 1
      ? team.find((row) => row.id === selected[0])?.name || '1'
      : `${selected.length} موظفين`;

  function placeMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 180 && above > below;
    setBox({
      top: up ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(160, Math.min(360, up ? above : below)),
      up,
    });
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onMove(event: Event) {
      if (menuRef.current?.contains(event.target as Node)) return;
      placeMenu();
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const node = menu;
    function onWheel(event: WheelEvent) {
      if (node.scrollHeight <= node.clientHeight + 1) return;
      event.preventDefault();
      event.stopPropagation();
      node.scrollTop += event.deltaY;
    }
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [open, box]);

  function toggleOne(id: string) {
    if (all) {
      onChange([id]);
      return;
    }
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    onChange(next.length === 0 || next.length === team.length ? [] : next);
  }

  return (
    <div className={`ui-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button ref={buttonRef} type="button" className="form-control ui-select-btn" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="ui-select-value">{label}</span>
        <svg className="ui-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && box
        ? createPortal(
            <ul
              ref={menuRef}
              className="ui-select-menu is-fixed"
              role="listbox"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight, transform: box.up ? 'translateY(-100%)' : undefined }}
            >
              <li>
                <button type="button" role="option" aria-selected={all} onClick={() => onChange([])}>الكل</button>
              </li>
              {team.map((row) => (
                <li key={row.id}>
                  <button type="button" role="option" aria-selected={!all && selected.includes(row.id)} onClick={() => toggleOne(row.id)}>
                    <span className={`staff-check${!all && selected.includes(row.id) ? ' is-on' : ''}`} aria-hidden="true" />
                    {row.name}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MonitorPanel({ actor, employees }: Props) {
  const team = useMemo(() => peopleUnder(actor, employees), [actor, employees]);
  const [type, setType] = useState<MonitorType>('EXCHANGE');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [sysFrom, setSysFrom] = useState(todayIso);
  const [sysTo, setSysTo] = useState(todayIso);
  const [cache, setCache] = useState<Partial<Record<MonitorType, MonitorRow[]>>>({});
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [query, setQuery] = useState('');
  const [filesRef, setFilesRef] = useState<string | null>(null);

  const rows = cache[type] || [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (kindFilter) {
        if (type === 'EXCHANGE' && row.exchangeType !== kindFilter) return false;
        if (type === 'ADVANCE' && row.advanceType !== kindFilter) return false;
        if ((type === 'INCOME' || type === 'OUTCOME' || type === 'TRANSFER') && row.fund !== kindFilter && row.fromFund !== kindFilter) return false;
      }
      if (!needle) return true;
      return JSON.stringify(row).toLowerCase().includes(needle);
    });
  }, [rows, statusFilter, kindFilter, query, type]);

  async function display(event?: FormEvent) {
    event?.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const results = await Promise.all(
        MONITOR_TYPES.map((item) => listMonitor({
          type: item.value,
          employeeIds: pickedIds.length ? pickedIds : undefined,
          sysFrom,
          sysTo,
        })),
      );
      const nextCache: Partial<Record<MonitorType, MonitorRow[]>> = {};
      const nextCounts = { ...EMPTY_COUNTS };
      results.forEach((result, index) => {
        const key = MONITOR_TYPES[index].value;
        nextCache[key] = result.rows;
        nextCounts[key] = result.rows.length;
      });
      setCache(nextCache);
      setCounts(nextCounts);
      setShown(true);
    } catch (error) {
      setCache({});
      setCounts(EMPTY_COUNTS);
      setShown(false);
      setMessage(masterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    const day = todayIso();
    setSysFrom(day);
    setSysTo(day);
    setPickedIds([]);
    setStatusFilter('');
    setKindFilter('');
    setQuery('');
    setCache({});
    setCounts(EMPTY_COUNTS);
    setShown(false);
    setMessage('');
  }

  const kindOptions = type === 'EXCHANGE'
    ? EXCHANGE_TYPES.map((item) => ({ value: item.value, label: item.label }))
    : type === 'ADVANCE'
      ? ADVANCE_TYPES.map((item) => ({ value: item.value, label: item.label }))
      : OPERATION_FUNDS.map((item) => ({ value: item.value, label: item.label }));

  const cell = (value: React.ReactNode) => <span className="ui-log-num">{value}</span>;
  const columns: Column<MonitorRow>[] = [
    { key: 'number', header: 'رقم العملية', render: (row) => <strong dir="ltr" className="stmt-num">{row.operationNumber}</strong> },
    {
      key: 'time',
      header: 'التاريخ والوقت',
      render: (row) => (
        <span dir="ltr" className="stmt-num">
          {dateOnly(row.transactionDate)} {clockTime(row.systemDate) || ''}
        </span>
      ),
    },
    ...(type === 'EXCHANGE'
      ? ([
          { key: 'etype', header: 'نوع العملية', render: (row) => EXCHANGE_TYPES.find((item) => item.value === row.exchangeType)?.label || '—' },
          { key: 'rcur', header: 'العملة المستلمة', defaultHidden: true, render: (row) => <CurrencyMark code={row.receivedCurrency || 'USD'} /> },
          { key: 'ramt', header: 'المبلغ المستلم', numeric: true, render: (row) => cell(money(row.total, row.receivedCurrency)) },
          { key: 'pcur', header: 'العملة المدفوعة', defaultHidden: true, render: (row) => <CurrencyMark code={row.paidCurrency || 'USD'} /> },
          { key: 'rate', header: 'سعر الصرف', numeric: true, render: (row) => cell(row.exchangeRate ?? '—') },
          { key: 'pamt', header: 'المبلغ المدفوع', numeric: true, render: (row) => cell(money(row.exchangeAmount, row.paidCurrency)) },
        ] as Column<MonitorRow>[])
      : []),
    ...(type === 'INCOME' || type === 'OUTCOME'
      ? ([
          { key: 'project', header: 'المشروع', render: (row) => row.project?.name || '—' },
          { key: 'fund', header: 'الصندوق', render: (row) => `${fundLabel(row.fund)}${row.bank ? ` · ${row.bank.name}` : ''}` },
          { key: 'cur', header: 'العملة', render: (row) => <CurrencyMark code={row.currency || 'USD'} /> },
          { key: 'total', header: 'الإجمالي', numeric: true, render: (row) => cell(money(row.total, row.currency)) },
          { key: 'sender', header: type === 'INCOME' ? 'المرسل' : 'المسلّم', defaultHidden: true, render: (row) => (type === 'INCOME' ? row.sender : row.deliverer) || '—' },
          { key: 'receiver', header: 'المستلم', defaultHidden: true, render: (row) => row.receiver || '—' },
        ] as Column<MonitorRow>[])
      : []),
    ...(type === 'TRANSFER'
      ? ([
          { key: 'from', header: 'من', render: (row) => `${fundLabel(row.fromFund)}${row.fromBank ? ` · ${row.fromBank.name}` : ''}` },
          { key: 'to', header: 'إلى', render: (row) => `${fundLabel(row.toFund)}${row.toBank ? ` · ${row.toBank.name}` : ''}` },
          { key: 'cur', header: 'العملة', render: (row) => <CurrencyMark code={row.currency || 'USD'} /> },
          { key: 'amount', header: 'المبلغ', numeric: true, render: (row) => cell(money(row.amount, row.currency)) },
          { key: 'borrower', header: 'المستلف', defaultHidden: true, render: (row) => row.borrower?.name || '—' },
        ] as Column<MonitorRow>[])
      : []),
    ...(type === 'ADVANCE'
      ? ([
          { key: 'atype', header: 'النوع', render: (row) => ADVANCE_TYPES.find((item) => item.value === row.advanceType)?.label || '—' },
          { key: 'borrower', header: 'المستلف', render: (row) => row.borrower?.name || '—' },
          { key: 'cur', header: 'العملة', render: (row) => <CurrencyMark code={row.currency || row.toCurrency || 'USD'} /> },
          { key: 'total', header: 'الإجمالي', numeric: true, render: (row) => cell(money(row.total ?? row.amount, row.currency || row.toCurrency || undefined)) },
        ] as Column<MonitorRow>[])
      : []),
    { key: 'notes', header: 'ملاحظات', defaultHidden: true, render: (row) => row.notes || row.description || '—' },
    { key: 'status', header: 'الحالة', render: (row) => <Badge tone={row.status === 'COMPLETED' ? 'ok' : 'warn'}>{statusLabel(row.status)}</Badge> },
    {
      key: 'files',
      header: 'المرفقات',
      fixed: true,
      render: (row) =>
        attachmentCount(row.attachments) > 0 ? (
          <Button variant="mini" onClick={(event) => { event.stopPropagation(); setFilesRef(row.reference); }}>عرض</Button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="ui-page ui-wide">
      <Card title="سجل عمليات الموظفين">
        <div className="staff-counts">
          {MONITOR_TYPES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`staff-count${type === item.value ? ' is-on' : ''}`}
              onClick={() => { setType(item.value); setKindFilter(''); }}
            >
              <span>{item.label}</span>
              <strong>{counts[item.value]}</strong>
            </button>
          ))}
        </div>
        <form className="staff-toolbar" onSubmit={display}>
          <div className="form-group">
            <label className="form-label">الموظف</label>
            <StaffPeopleSelect team={team} selected={pickedIds} onChange={setPickedIds} />
          </div>
          <div className="form-group">
            <label className="form-label">من تاريخ</label>
            <input className="form-control" type="date" value={sysFrom} onChange={(event) => setSysFrom(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">إلى تاريخ</label>
            <input className="form-control" type="date" value={sysTo} onChange={(event) => setSysTo(event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{type === 'EXCHANGE' || type === 'ADVANCE' ? 'النوع' : 'الصندوق'}</label>
            <Select value={kindFilter} onChange={setKindFilter} options={[{ value: '', label: 'الكل' }, ...kindOptions]} />
          </div>
          <button type="submit" className="btn" disabled={loading}>{loading ? '...' : 'عرض'}</button>
          <button type="button" className="ui-log-advanced-toggle" onClick={reset}>إعادة ضبط</button>
        </form>
        <div className="staff-filters">
          <div className="form-group">
            <label className="form-label">الحالة</label>
            <Select value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'كل الحالات' }, { value: 'COMPLETED', label: 'مكتملة' }, { value: 'PENDING_APPROVAL', label: 'بانتظار الموافقة' }]} />
          </div>
          <div className="form-group ui-log-live-search">
            <label className="form-label">بحث</label>
            <input className="form-control" value={query} placeholder="بحث سريع..." onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        {message ? <p className="ui-log-empty">{message}</p> : null}
        {!shown ? (
          <p className="ui-log-empty">حدد الفترة ثم اضغط عرض.</p>
        ) : visible.length === 0 ? (
          <p className="ui-log-empty">لا عمليات ضمن هذا النطاق.</p>
        ) : (
          <DataTable tableId={`monitor-${type}`} columns={columns} rows={visible} rowKey={(row) => row.id} />
        )}
        {filesRef ? (
          <FileViewer reference={filesRef} title="المرفق" closeLabel="إغلاق" onClose={() => setFilesRef(null)} />
        ) : null}
      </Card>
    </div>
  );
}
