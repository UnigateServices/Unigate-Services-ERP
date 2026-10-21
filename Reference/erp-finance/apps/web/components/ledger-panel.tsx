'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AccountRow,
  AccountType,
  AuthUser,
  CostCenterRow,
  JournalEntryInput,
  JournalEntryRow,
  StatementLineOption,
  createAccount,
  createJournalEntry,
  deleteJournalEntry,
  listAccounts,
  listCostCenters,
  listJournalEntries,
  listStatementLines,
  postJournalEntry,
  reverseJournalEntry,
  setAccountStatus,
  updateAccount,
  updateJournalEntry,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Column, DataTable } from './ui/data-table';
import { FilterPills } from './ui/page-toolbar';
import { StatCard, StatGrid } from './ui/stat-card';
import { ListPage } from './ui/templates';
import { Modal } from './ui/modal';
import { Field, Input, Textarea } from './ui/field';
import { Select } from './ui/select';
import { EmptyState, Table } from './ui/table';
import { useToasts } from './ui/toasts';

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'ASSET', label: 'أصل' },
  { value: 'LIABILITY', label: 'التزام' },
  { value: 'EQUITY', label: 'حقوق ملكية' },
  { value: 'INCOME', label: 'إيراد' },
  { value: 'EXPENSE', label: 'مصروف' },
];

type DraftLine = {
  key: string;
  accountId: string;
  currency: 'USD' | 'SYP';
  debit: string;
  credit: string;
  memo: string;
  costCenterId: string;
};

function blankLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), accountId: '', currency: 'USD', debit: '', credit: '', memo: '', costCenterId: '' };
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function amount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function entryStatus(row: JournalEntryRow) {
  if (row.status === 'DRAFT') return { label: 'مسودة', tone: 'wait' };
  if (row.reversedBy) return { label: `معكوس ${row.reversedBy.number}`, tone: 'wait' };
  return { label: 'مرحّل', tone: 'ok' };
}

const SOURCE_LABEL: Record<string, string> = {
  INCOME: 'وارد',
  OUTCOME: 'صادر',
  EXCHANGE: 'تصريف',
  TRANSFER: 'تحويل',
  ADVANCE: 'سلفة',
  SALES: 'فاتورة مبيعات',
  PURCHASE: 'فاتورة شراء',
  FX_REVAL: 'تقييم عملات',
  MANUAL: 'قيد يدوي',
};

const GROUP_NAMES: Record<string, string> = {
  '11': 'الأصول المتداولة',
  '111': 'النقد وما في حكمه',
  '115': 'العملات الأجنبية',
  '12': 'الذمم المدينة',
  '13': 'السلف',
  '14': 'المخزون',
  '21': 'الخصوم المتداولة',
  '31': 'رأس المال والأرباح',
  '41': 'إيراد النشاط',
  '42': 'أرباح العملات',
  '49': 'إيرادات أخرى',
  '50': 'المشتريات',
  '51': 'تكلفة المبيعات',
  '52': 'مصروفات التشغيل',
  '53': 'خسائر العملات',
  '54': 'تعديلات المخزون',
};

const TYPE_ROOTS: { type: AccountType; code: string; name: string }[] = [
  { type: 'ASSET', code: '1', name: 'الأصول' },
  { type: 'LIABILITY', code: '2', name: 'الخصوم' },
  { type: 'EQUITY', code: '3', name: 'حقوق الملكية' },
  { type: 'INCOME', code: '4', name: 'الإيرادات' },
  { type: 'EXPENSE', code: '5', name: 'المصروفات' },
];

type ChartNode = {
  key: string;
  code: string;
  name: string;
  account: AccountRow | null;
  children: ChartNode[];
};

function groupPath(type: AccountType, code: string) {
  if (type === 'ASSET') {
    if (/^11[123]/.test(code)) return ['11', '111'];
    if (code.startsWith('115')) return ['11', '115'];
    if (code.startsWith('12')) return ['11', '12'];
    if (code.startsWith('13')) return ['11', '13'];
    if (code.startsWith('14')) return ['11', '14'];
    return ['11'];
  }
  if (type === 'LIABILITY') return ['21'];
  if (type === 'EQUITY') return ['31'];
  if (type === 'INCOME') {
    if (code.startsWith('42')) return ['42'];
    if (code.startsWith('49')) return ['49'];
    return ['41'];
  }
  if (code.startsWith('50')) return ['50'];
  if (code.startsWith('51')) return ['51'];
  if (code.startsWith('53')) return ['53'];
  if (code.startsWith('54')) return ['54'];
  return ['52'];
}

function accountBranch(row: AccountRow, childrenOf: Map<string, AccountRow[]>): ChartNode {
  const kids = (childrenOf.get(row.id) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code));
  return { key: row.id, code: row.code, name: row.name, account: row, children: kids.map((child) => accountBranch(child, childrenOf)) };
}

function buildChartTree(accounts: AccountRow[]): ChartNode[] {
  const byId = new Map(accounts.map((row) => [row.id, row]));
  const childrenOf = new Map<string, AccountRow[]>();
  const tops: AccountRow[] = [];
  for (const row of accounts) {
    if (row.parentId && byId.has(row.parentId)) {
      const list = childrenOf.get(row.parentId) ?? [];
      list.push(row);
      childrenOf.set(row.parentId, list);
    } else tops.push(row);
  }
  const groups = new Map<string, ChartNode>();
  const nested = new Set<string>();
  const group = (code: string) => {
    let node = groups.get(code);
    if (!node) {
      node = { key: `g-${code}`, code, name: GROUP_NAMES[code] || code, account: null, children: [] };
      groups.set(code, node);
    }
    return node;
  };
  for (const row of tops) {
    const path = groupPath(row.type, row.code);
    let parent: ChartNode | null = null;
    for (const code of path) {
      const node = group(code);
      if (parent && !parent.children.some((child) => child.key === node.key)) {
        parent.children.push(node);
        nested.add(node.key);
      }
      parent = node;
    }
    parent?.children.push(accountBranch(row, childrenOf));
  }
  for (const node of groups.values()) {
    node.children.sort((a, b) => a.code.localeCompare(b.code));
  }
  return TYPE_ROOTS.map((root) => ({
    key: `g-${root.code}`,
    code: root.code,
    name: root.name,
    account: null,
    children: [...groups.values()]
      .filter((node) => !nested.has(node.key) && node.code.startsWith(root.code))
      .sort((a, b) => a.code.localeCompare(b.code)),
  })).filter((root) => root.children.length > 0);
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function entryBooks(row: JournalEntryRow) {
  const currencies = [...new Set(row.lines.map((line) => line.currency))];
  return currencies.map((currency) => {
    const lines = row.lines.filter((line) => line.currency === currency);
    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    return { currency, debit, credit, balanced: debit.toFixed(2) === credit.toFixed(2) };
  });
}

export function LedgerPanel({ actor, screen = 'journal' }: { actor: AuthUser; screen?: 'journal' | 'entry' | 'chart' }) {
  const canWrite = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const { push, node: toasts } = useToasts();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [linesCatalog, setLinesCatalog] = useState<StatementLineOption[]>([]);
  const [centers, setCenters] = useState<CostCenterRow[]>([]);
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('EXPENSE');
  const [parentId, setParentId] = useState('');
  const [statementLine, setStatementLine] = useState('');
  const [editor, setEditor] = useState<null | { id: string }>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [chartAdding, setChartAdding] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState<Set<string>>(() => new Set(['g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-11']));

  async function load() {
    const [nextAccounts, nextEntries, nextCenters, nextLines] = await Promise.all([
      listAccounts(),
      listJournalEntries(),
      listCostCenters(),
      listStatementLines(),
    ]);
    setAccounts(nextAccounts);
    setEntries(nextEntries);
    setCenters(nextCenters);
    setLinesCatalog(nextLines);
    setReady(true);
  }

  useEffect(() => {
    load().catch((error) => push(masterErrorMessage(error), 'err'));
  }, []);

  useEffect(() => {
    function resetEntry() {
      setDraftId(null);
      setDraftNumber(null);
      setDate(today());
      setDescription('');
      setLines([blankLine(), blankLine()]);
    }
    function onSection(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (id === 'ledger') setEditor(null);
      if (id === 'journal-new') resetEntry();
    }
    window.addEventListener('tradivia-section', onSection);
    return () => window.removeEventListener('tradivia-section', onSection);
  }, []);

  const activeAccounts = accounts.filter((row) => row.status === 'ACTIVE' && !row.hasChildren);
  const lineChoices = linesCatalog.filter((line) => line.section === type);
  const parentChoices = accounts.filter((row) => row.type === type);
  const chartTree = useMemo(() => buildChartTree(accounts), [accounts]);
  const totals = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const row = map.get(line.currency) ?? { debit: 0, credit: 0 };
      row.debit += amount(line.debit);
      row.credit += amount(line.credit);
      map.set(line.currency, row);
    }
    return [...map.entries()];
  }, [lines]);

  function openEdit(row: JournalEntryRow) {
    setEditor({ id: row.id });
    setDate(row.transactionDate);
    setDescription(row.description);
    setLines(row.lines.map((line) => ({
      key: line.id,
      accountId: line.accountId,
      currency: line.currency,
      debit: Number(line.debit) ? line.debit : '',
      credit: Number(line.credit) ? line.credit : '',
      memo: line.memo,
      costCenterId: line.costCenterId ?? '',
    })));
  }

  function payload(post: boolean): JournalEntryInput {
    return {
      transactionDate: date,
      description,
      post,
      lines: lines
        .filter((line) => line.accountId && (amount(line.debit) > 0 || amount(line.credit) > 0))
        .map((line) => ({
          accountId: line.accountId,
          currency: line.currency,
          debit: amount(line.debit),
          credit: amount(line.credit),
          memo: line.memo,
          ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
        })),
    };
  }

  async function saveEntry(post: boolean) {
    setSaving(true);
    try {
      const id = screen === 'entry' ? draftId : editor?.id;
      const saved = id ? await updateJournalEntry(id, payload(false)) : await createJournalEntry(payload(false));
      if (post) await postJournalEntry(saved.id);
      push(post ? 'رُحّل القيد.' : 'حُفظت المسودة.', 'ok');
      await load();
      if (post) {
        if (screen === 'entry') window.location.hash = '#accounting/ledger';
        else setEditor(null);
        return;
      }
      if (screen === 'entry') {
        setDraftId(saved.id);
        setDraftNumber(saved.number);
      }
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      push(ok, 'ok');
      await load();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  function toggleChart(key: string) {
    setChartOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openVoucher(row: JournalEntryRow) {
    setReverseReason('');
    setReverseOpen(false);
    setVoucherId(row.id);
  }

  async function confirmReverse() {
    if (!voucherId || !reverseReason.trim()) return;
    setReversing(true);
    try {
      await reverseJournalEntry(voucherId, reverseReason.trim());
      setReverseReason('');
      push('أُنشئ القيد العكسي وسُجّل السبب.', 'ok');
      await load();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setReversing(false);
    }
  }

  const balanced = totals.length > 0 && totals.every(([, row]) => row.debit === row.credit);
  const entryId = screen === 'entry' ? draftId : editor?.id;
  const entryNumber = screen === 'entry' ? draftNumber : entries.find((row) => row.id === editor?.id)?.number;
  const showEntry = screen === 'entry' || (screen === 'journal' && editor != null);
  const voucher = entries.find((row) => row.id === voucherId) ?? null;

  const [journalQuery, setJournalQuery] = useState('');
  const [journalFilter, setJournalFilter] = useState<'ALL' | 'DRAFT' | 'POSTED' | 'REVERSED'>('ALL');
  const visibleEntries = useMemo(() => {
    const needle = journalQuery.trim().toLowerCase();
    return entries.filter((row) => {
      if (journalFilter === 'DRAFT' && row.status !== 'DRAFT') return false;
      if (journalFilter === 'POSTED' && (row.status === 'DRAFT' || row.reversedBy)) return false;
      if (journalFilter === 'REVERSED' && !row.reversedBy) return false;
      return !needle || `${row.number} ${row.description}`.toLowerCase().includes(needle);
    });
  }, [entries, journalQuery, journalFilter]);

  const journalColumns: Column<JournalEntryRow>[] = [
    { key: 'number', header: 'الرقم', render: (row) => <strong dir="ltr" className="stmt-num">{row.number}</strong> },
    { key: 'date', header: 'التاريخ', render: (row) => <span dir="ltr" className="stmt-num">{row.transactionDate}</span> },
    {
      key: 'description',
      header: 'البيان',
      render: (row) => (
        <>
          {row.description || '—'}
          {row.reversalOf ? <small> عكس {row.reversalOf.number}</small> : null}
        </>
      ),
    },
    { key: 'center', header: 'المركز', defaultHidden: true, render: (row) => [...new Set(row.lines.map((line) => line.costCenter?.name).filter(Boolean))].join('، ') || '—' },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => {
        const state = entryStatus(row);
        return <Badge tone={state.tone === 'ok' ? 'ok' : 'warn'}>{state.label}</Badge>;
      },
    },
    { key: 'employee', header: 'الموظف', defaultHidden: true, render: (row) => row.employee.name },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) =>
        canWrite && row.status === 'DRAFT' ? (
          <div className="ui-log-actions" onClick={(event) => event.stopPropagation()}>
            <Button variant="mini" onClick={() => void run(() => postJournalEntry(row.id), 'رُحّل القيد.')}>ترحيل</Button>
            <Button variant="mini" onClick={() => openEdit(row)}>تعديل</Button>
            <Button variant="mini" className="is-danger" onClick={() => void run(() => deleteJournalEntry(row.id), 'حُذفت المسودة.')}>حذف</Button>
          </div>
        ) : null,
    },
  ];

  const voucherColumns: Column<JournalEntryRow['lines'][number]>[] = [
    { key: 'code', header: 'رمز الحساب', render: (line) => <span dir="ltr" className="stmt-num">{line.account.code}</span> },
    { key: 'name', header: 'اسم الحساب', render: (line) => line.account.name },
    { key: 'center', header: 'مركز التكلفة', defaultHidden: true, render: (line) => line.costCenter?.name || '—' },
    { key: 'debit', header: 'مدين', numeric: true, render: (line) => <span dir="ltr" className="stmt-num">{Number(line.debit) ? money(line.debit) : ''}</span> },
    { key: 'credit', header: 'دائن', numeric: true, render: (line) => <span dir="ltr" className="stmt-num">{Number(line.credit) ? money(line.credit) : ''}</span> },
    { key: 'memo', header: 'الوصف', render: (line) => line.memo || '—' },
  ];

  function renderChart(node: ChartNode, depth: number) {
    const expanded = chartOpen.has(node.key);
    const account = node.account;
    const editing = account && editingAccount === account.id;
    const group = !account;
    return (
      <div key={node.key} className="chart-branch">
        <div
          className={`chart-row${group ? ' is-group' : ''}${depth === 0 ? ' is-root' : ''}${editing ? ' is-editing' : ''}`}
          style={{ ['--chart-level' as string]: String(depth) }}
        >
          {node.children.length ? (
            <button type="button" className="chart-chevron" aria-expanded={expanded} onClick={() => toggleChart(node.key)}>
              {expanded ? '−' : '+'}
            </button>
          ) : <span className="chart-chevron is-leaf" />}
          <span className="chart-main">
            {group ? (
              <svg className="chart-folder" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 3.5h4l1.2 1.4H14.5v7.6h-13V3.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg className="chart-folder" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 1.5h6.2L12.5 4.2V14.5H3V1.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M9 1.8V4.4h2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
            <span className="chart-code">{node.code}</span>
            <span className="chart-name">{node.name}</span>
          </span>
          {account ? (
            <>
            <span className="chart-meta">
              <Badge tone="info">{TYPES.find((item) => item.value === account.type)?.label || account.type}</Badge>
              <span className={`chart-pill${account.status === 'ACTIVE' ? ' is-ok' : ' is-wait'}`}>{account.status === 'ACTIVE' ? 'نشط' : 'موقوف'}</span>
            </span>
            <span className="chart-actions">
              {canWrite ? (
                <button type="button" className="chart-edit-btn" onClick={() => setEditingAccount(editing ? null : account.id)}>
                  {editing ? 'إغلاق' : 'تعديل'}
                </button>
              ) : null}
            </span>
            </>
          ) : null}
        </div>
        {editing && account ? (
          <div className="chart-edit">
            <Field label="بند القائمة">
              <Select
                value={account.statementLine}
                onChange={(next) => void run(() => updateAccount(account.id, { statementLine: next }), 'تحدّث بند القائمة.')}
                options={linesCatalog.filter((line) => line.section === account.type).map((line) => ({ value: line.code, label: line.name }))}
              />
            </Field>
            {account.system ? <span className="chart-pill">حساب نظام</span> : (
              <Button
                variant="mini"
                onClick={() => void run(() => setAccountStatus(account.id, account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'), 'تحدّثت حالة الحساب.')}
              >
                {account.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
              </Button>
            )}
          </div>
        ) : null}
        {node.children.length && expanded ? (
          <div className="chart-children" style={{ ['--chart-level' as string]: String(depth) }}>
            {node.children.map((child) => renderChart(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ui-page">
      {toasts}
      {screen === 'chart' ? (
      <Card title="دليل الحسابات" chip="المحاسبة" count={accounts.length} toolbar={canWrite ? (
        <Button variant="tool" type="button" onClick={() => setChartAdding((open) => !open)}>
          {chartAdding ? 'إغلاق الإضافة' : '+ إضافة حساب'}
        </Button>
      ) : undefined}>
        {canWrite && chartAdding ? (
          <form
            className="ui-form-grid chart-add"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await createAccount({
                  code,
                  name,
                  type,
                  ...(parentId ? { parentId } : {}),
                  ...(statementLine ? { statementLine } : {}),
                });
                setCode('');
                setName('');
                setParentId('');
                setStatementLine('');
                setChartAdding(false);
              }, 'أُضيف الحساب.');
            }}
          >
            <Field label="الرمز"><Input value={code} onChange={(event) => setCode(event.target.value)} required maxLength={20} /></Field>
            <Field label="الاسم"><Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></Field>
            <Field label="النوع">
              <Select value={type} onChange={(value) => { setType(value as AccountType); setParentId(''); setStatementLine(''); }} options={TYPES} />
            </Field>
            <Field label="يتبع">
              <Select
                value={parentId}
                onChange={setParentId}
                placeholder="بدون أب"
                options={[{ value: '', label: 'بدون أب' }, ...parentChoices.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))]}
              />
            </Field>
            <Field label="بند القائمة">
              <Select
                value={statementLine}
                onChange={setStatementLine}
                placeholder="حسب النوع"
                options={[{ value: '', label: 'حسب النوع' }, ...lineChoices.map((line) => ({ value: line.code, label: line.name }))]}
              />
            </Field>
            <div className="ui-span-all"><Button type="submit" variant="primary">حفظ الحساب</Button></div>
          </form>
        ) : null}
        {!ready ? <EmptyState title="جاري تحميل الدليل..." /> : (
          <div className="chart-tree">
            {chartTree.map((node) => renderChart(node, 0))}
          </div>
        )}
      </Card>
      ) : null}

      {screen === 'journal' && !showEntry ? (
        <ListPage
          title="دفتر القيود اليومية"
          newLabel="+ قيد جديد"
          onNew={canWrite ? () => { window.location.hash = 'accounting/journal-new'; } : undefined}
          kpis={
            <StatGrid>
              <StatCard label="إجمالي القيود" value={<span dir="ltr" className="stmt-num">{entries.length}</span>} />
              <StatCard label="مرحّلة" value={<span dir="ltr" className="stmt-num">{entries.filter((row) => row.status !== 'DRAFT' && !row.reversedBy).length}</span>} />
              <StatCard label="مسودات" value={<span dir="ltr" className="stmt-num">{entries.filter((row) => row.status === 'DRAFT').length}</span>} />
              <StatCard label="معكوسة" value={<span dir="ltr" className="stmt-num">{entries.filter((row) => row.reversedBy).length}</span>} />
            </StatGrid>
          }
          search={journalQuery}
          onSearch={setJournalQuery}
          searchPlaceholder="بحث بالرقم أو البيان"
          filters={
            <FilterPills
              value={journalFilter}
              onChange={setJournalFilter}
              options={[['ALL', 'الكل'], ['DRAFT', 'مسودات'], ['POSTED', 'مرحّلة'], ['REVERSED', 'معكوسة']] as const}
            />
          }
          columns={journalColumns}
          rows={visibleEntries}
          rowKey={(row) => row.id}
          onOpen={openVoucher}
          ready={ready}
          tableId="journal-entries"
          empty="لا قيود مطابقة. القيد يُحفظ فقط إذا تساوى المدين والدائن في كل عملة."
        />
      ) : null}

      {showEntry && canWrite ? (
        <Card title={entryNumber ? `قيد ${entryNumber}` : 'قيد جديد'} chip="المحاسبة" className="journal-sheet">
          <form onSubmit={(event) => { event.preventDefault(); void saveEntry(false); }}>
            <div className="ui-form-grid">
              <Field label="التاريخ"><Input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></Field>
              <Field label="البيان"><Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></Field>
            </div>
            <div className="journal-lines">
              <Table dense>
                <thead>
                  <tr><th>الحساب</th><th>المركز</th><th>العملة</th><th>مدين</th><th>دائن</th><th>ملاحظة</th><th /></tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td>
                        <Select
                          value={line.accountId}
                          placeholder="الحساب"
                          onChange={(accountId) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, accountId } : item))}
                          options={activeAccounts.map((row) => ({ value: row.id, label: `${row.code} ${row.name}` }))}
                        />
                      </td>
                      <td>
                        <Select
                          value={line.costCenterId}
                          placeholder="بدون مركز"
                          onChange={(costCenterId) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, costCenterId } : item))}
                          options={[{ value: '', label: 'بدون مركز' }, ...centers.map((row) => ({ value: row.id, label: row.name }))]}
                        />
                      </td>
                      <td>
                        <Select
                          value={line.currency}
                          onChange={(currency) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, currency: currency as 'USD' | 'SYP' } : item))}
                          options={[{ value: 'USD', label: 'USD' }, { value: 'SYP', label: 'ل.س' }]}
                        />
                      </td>
                      <td><Input inputMode="decimal" value={line.debit} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, debit: event.target.value, credit: event.target.value ? '' : item.credit } : item))} /></td>
                      <td><Input inputMode="decimal" value={line.credit} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, credit: event.target.value, debit: event.target.value ? '' : item.debit } : item))} /></td>
                      <td><Input value={line.memo} onChange={(event) => setLines((rows) => rows.map((item) => item.key === line.key ? { ...item, memo: event.target.value } : item))} /></td>
                      <td>{lines.length > 2 ? <Button variant="mini" type="button" className="is-danger" onClick={() => setLines((rows) => rows.filter((item) => item.key !== line.key))}>حذف</Button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Button variant="secondary" type="button" onClick={() => setLines((rows) => [...rows, blankLine()])}>بند جديد</Button>
            </div>
            <div className="ui-action-row">
              <div className="ui-total-box">
                <div className="ui-total-label">{balanced ? 'متوازن' : 'المدين والدائن'}</div>
                <div className={`ui-total-value${balanced ? '' : ' is-neg'}`}>
                  {totals.length === 0 ? <span>0</span> : totals.map(([currency, row]) => (
                    <span key={currency}>{row.debit.toFixed(2)} / {row.credit.toFixed(2)} {currency}</span>
                  ))}
                </div>
              </div>
              <div className="ui-submit-stack">
                <Button variant="submit" type="submit" disabled={saving || !balanced}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {saving ? 'جارٍ الحفظ' : 'حفظ'}
                </Button>
                {entryId ? (
                  <Button variant="soft" type="button" disabled={saving || !balanced} onClick={() => void saveEntry(true)}>ترحيل</Button>
                ) : null}
              </div>
            </div>
          </form>
        </Card>
      ) : null}

      {voucher ? (
        <Modal className="journal-voucher-dialog" title={`سند قيد ${voucher.number}`} onClose={() => setVoucherId(null)}>
          <div className="journal-voucher">
            <header className="journal-voucher-card">
              <div className="journal-voucher-id">
                <span>سند قيد</span>
                <strong>{voucher.number}</strong>
              </div>
              <div className="journal-voucher-meta">
                <div><span>التاريخ</span><strong>{voucher.transactionDate}</strong></div>
                <div><span>المُنشئ</span><strong>{voucher.employee.name}</strong></div>
                <div><span>الحالة</span><strong className={`chart-pill${voucher.status === 'DRAFT' || voucher.reversedBy ? ' is-wait' : ' is-ok'}`}>{entryStatus(voucher).label}</strong></div>
              </div>
              <div className="journal-voucher-ref">
                <span>المستند المرجعي</span>
                <strong>
                  {[
                    voucher.sourceType ? SOURCE_LABEL[voucher.sourceType] || voucher.sourceType : '',
                    voucher.reversalOf ? `قيد ${voucher.reversalOf.number}` : '',
                    voucher.description,
                  ].filter(Boolean).join(' · ') || '—'}
                </strong>
              </div>
            </header>
            <DataTable tableId="journal-voucher" columns={voucherColumns} rows={voucher.lines} rowKey={(line) => line.id} />
            <table className="voucher-balance">
              <thead>
                <tr>
                  <th>العملة</th>
                  <th className="is-num">مجموع المدين</th>
                  <th className="is-num">مجموع الدائن</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {entryBooks(voucher).map((book) => (
                  <tr key={book.currency}>
                    <td>{book.currency}</td>
                    <td className="is-num">{money(book.debit)}</td>
                    <td className="is-num">{money(book.credit)}</td>
                    <td>{book.balanced ? 'متوازن' : money(Math.abs(book.debit - book.credit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canWrite && voucher.status === 'POSTED' && !voucher.reversedBy ? (
              <div className="journal-reverse">
                <button type="button" className="journal-reverse-toggle" onClick={() => setReverseOpen((open) => !open)}>
                  {reverseOpen ? 'إغلاق' : 'إلغاء أو عكس القيد'}
                </button>
                {reverseOpen ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void confirmReverse();
                    }}
                  >
                    <Field label="سبب العكس">
                      <Textarea required value={reverseReason} maxLength={500} onChange={(event) => setReverseReason(event.target.value)} placeholder="سبب إلغاء القيد" />
                    </Field>
                    <Button variant="submit" type="submit" disabled={reversing || !reverseReason.trim()}>
                      {reversing ? 'جارٍ العكس' : 'طلب عكس / إلغاء القيد'}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
