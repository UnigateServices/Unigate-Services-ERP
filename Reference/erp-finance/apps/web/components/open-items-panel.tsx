'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  CustomerRow,
  OpenItemRow,
  OperationFund,
  ProjectRow,
  SupplierRow,
  collectOpenItem,
  createOpenItem,
  deleteOpenItem,
  listCustomers,
  listOpenItems,
  listSuppliers,
  openItemAging,
  openItemStatement,
  previewOpenItemRevalue,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Combobox } from './ui/combobox';
import { Badge } from './ui/badge';
import { Column, DataTable } from './ui/data-table';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input } from './ui/field';
import { Select } from './ui/select';
import { EmptyState, Table } from './ui/table';
import { useToasts } from './ui/toasts';
import './enterprise.css';

const KINDS = [
  { value: 'RECEIVABLE', label: 'ذمة لنا' },
  { value: 'PAYABLE', label: 'ذمة علينا' },
  { value: 'ADVANCE_IN', label: 'دفعة للمورد' },
];

type Screen = 'list' | 'new' | 'statement' | 'aging' | 'revalue';

type StatementDoc = { partyName: string; net: string; items: OpenItemRow[] };
type AgingDoc = {
  total: string;
  buckets: { code: string; name: string; amount: string }[];
  lines: (OpenItemRow & { days: number; bucket: string })[];
};
type RevalueLine = OpenItemRow & { gap: string };
type RevalueDoc = { monetary: RevalueLine[]; goods: RevalueLine[] };

function today() {
  return new Date().toISOString().slice(0, 10);
}

const KIND_LABELS: Record<string, string> = {
  RECEIVABLE: 'ذمة لنا',
  PAYABLE: 'ذمة علينا',
  ADVANCE_IN: 'دفعة لمورد',
  ADVANCE_OUT: 'سلفة',
  CUSTODY: 'عهدة',
};

function kindLabel(kind: string) {
  return KIND_LABELS[kind] || 'أخرى';
}

export function OpenItemsPanel({
  projects,
  screen = 'list',
  canWrite = true,
}: {
  projects: ProjectRow[];
  screen?: Screen;
  canWrite?: boolean;
}) {
  const { push, node: toasts } = useToasts();
  const [tab, setTab] = useState<Screen>(screen === 'new' ? 'list' : screen);
  const [newOpen, setNewOpen] = useState(screen === 'new');
  const [rows, setRows] = useState<OpenItemRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [ready, setReady] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [party, setParty] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [partyId, setPartyId] = useState('');
  const [kind, setKind] = useState<OpenItemRow['kind']>('RECEIVABLE');
  const [documentDate, setDocumentDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [settlementMode, setSettlementMode] = useState<'CASH' | 'GOODS'>('CASH');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [collectRow, setCollectRow] = useState<OpenItemRow | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectDate, setCollectDate] = useState(today());
  const [projectId, setProjectId] = useState('');
  const [fund, setFund] = useState<OperationFund>('VAULT');
  const [statementId, setStatementId] = useState('');
  const [statement, setStatement] = useState<StatementDoc | null>(null);
  const [statementEmpty, setStatementEmpty] = useState(false);
  const [asOf, setAsOf] = useState(today());
  const [aging, setAging] = useState<AgingDoc | null>(null);
  const [rate, setRate] = useState('');
  const [revalue, setRevalue] = useState<RevalueDoc | null>(null);

  const collectProjects = projects.filter(
    (row) => row.status === 'ACTIVE' && row.showIn.includes(collectRow?.kind === 'PAYABLE' ? 'OUTCOME' : 'INCOME'),
  );

  async function reload() {
    const [items, customerRows, supplierRows] = await Promise.all([listOpenItems(), listCustomers(), listSuppliers()]);
    setRows(items);
    setCustomers(customerRows);
    setSuppliers(supplierRows);
    setReady(true);
  }

  useEffect(() => {
    reload().catch((error) => push(masterErrorMessage(error), 'err'));
  }, []);

  useEffect(() => {
    function onSection(event: Event) {
      if ((event as CustomEvent<string>).detail === 'open-items') setCollectRow(null);
    }
    window.addEventListener('tradivia-section', onSection);
    return () => window.removeEventListener('tradivia-section', onSection);
  }, []);

  useEffect(() => {
    if (tab !== 'aging') return;
    void loadAging(today());
  }, [tab]);

  const parties = party === 'CUSTOMER' ? customers : suppliers;
  const partyOptions = useMemo(() => parties.map((row) => ({ value: row.id, label: row.name })), [parties]);
  const statementOptions = useMemo(
    () => [
      ...customers.map((row) => ({ value: row.id, label: `زبون — ${row.name}` })),
      ...suppliers.map((row) => ({ value: row.id, label: `مورد — ${row.name}` })),
    ],
    [customers, suppliers],
  );

  async function save() {
    setSaving(true);
    try {
      await createOpenItem({
        party,
        customerId: party === 'CUSTOMER' ? partyId : undefined,
        supplierId: party === 'SUPPLIER' ? partyId : undefined,
        kind,
        documentDate,
        currency: 'USD',
        amount: Number(amount),
        settlementMode,
        memo,
      });
      push('حُفظ البند.', 'ok');
      setNewOpen(false);
      setTab('list');
      setAmount('');
      setMemo('');
      setPartyId('');
      await reload();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function loadStatement(id: string) {
    setStatementId(id);
    setStatement(null);
    setStatementEmpty(false);
    if (!id) return;
    try {
      setStatement(await openItemStatement(id));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'OPEN_ITEM_NOT_FOUND') {
        setStatementEmpty(true);
        return;
      }
      push(masterErrorMessage(error), 'err');
    }
  }

  async function loadAging(date: string) {
    try {
      const doc = await openItemAging(date);
      setAging({ total: doc.total, buckets: doc.buckets, lines: doc.lines });
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  async function loadRevalue() {
    try {
      const doc = await previewOpenItemRevalue(asOf, Number(rate) > 0 ? Number(rate) : undefined);
      setRevalue({ monetary: doc.monetary, goods: doc.goods });
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    }
  }

  async function collect() {
    if (!collectRow) return;
    setSaving(true);
    try {
      const row = await collectOpenItem(collectRow.id, {
        amount: Number(collectAmount),
        fund,
        projectId,
        transactionDate: collectDate,
      });
      push(collectRow.kind === 'PAYABLE' ? `سُجّل الدفع. المتبقي ${row.remaining}.` : `سُجّل القبض. المتبقي ${row.remaining}.`, 'ok');
      setCollectRow(null);
      await reload();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Screen; label: string }[] = [
    { id: 'list', label: 'القائمة' },
    { id: 'statement', label: 'كشف الحساب' },
    { id: 'aging', label: 'أعمار الديون' },
    { id: 'revalue', label: 'إعادة التقييم' },
    ...(canWrite ? [{ id: 'new' as const, label: 'بند جديد' }] : []),
  ];

  const visibleRows = useMemo(() => {
    const needle = listQuery.trim();
    if (!needle) return rows;
    return rows.filter((row) => `${row.partyName} ${row.memo} ${row.reference}`.includes(needle));
  }, [rows, listQuery]);

  const statusBadge = (row: OpenItemRow) => <Badge tone={row.status === 'OPEN' ? 'warn' : 'ok'}>{row.status === 'OPEN' ? 'مفتوح' : 'مغلق'}</Badge>;
  const num = (value: string | number) => <span dir="ltr" className="stmt-num">{value}</span>;

  const listColumns: Column<OpenItemRow>[] = [
    { key: 'party', header: 'الطرف', render: (row) => <strong>{row.partyName}</strong> },
    { key: 'kind', header: 'النوع', render: (row) => kindLabel(row.kind) },
    { key: 'date', header: 'التاريخ', render: (row) => num(row.documentDate) },
    { key: 'due', header: 'الاستحقاق', defaultHidden: true, render: (row) => num(row.dueDate || '—') },
    { key: 'original', header: 'الأصلي', numeric: true, render: (row) => num(row.originalAmount) },
    { key: 'remaining', header: 'المتبقي', numeric: true, render: (row) => num(row.remaining) },
    { key: 'currency', header: 'العملة', defaultHidden: true, render: (row) => row.currency },
    { key: 'mode', header: 'التسوية', render: (row) => (row.settlementMode === 'GOODS' ? 'بضاعة' : 'نقد') },
    { key: 'memo', header: 'البيان', defaultHidden: true, render: (row) => row.memo || row.reference || '—' },
    { key: 'status', header: 'الحالة', render: statusBadge },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) =>
        canWrite ? (
          <div className="ui-log-actions">
            {row.status === 'OPEN' && (row.kind === 'RECEIVABLE' || row.kind === 'PAYABLE') ? (
              <Button
                variant="mini"
                onClick={() => {
                  setCollectRow(row);
                  setCollectAmount(row.remaining);
                  setProjectId('');
                }}
              >
                {row.kind === 'PAYABLE' ? 'تسجيل دفعة' : 'قبض دفعة'}
              </Button>
            ) : null}
            {row.sourceType === 'MANUAL' && row.status === 'OPEN' ? (
              <Button
                variant="mini"
                onClick={() =>
                  void deleteOpenItem(row.id)
                    .then(reload)
                    .then(() => push('حُذف البند اليدوي.', 'ok'))
                    .catch((error) => push(masterErrorMessage(error), 'err'))
                }
              >
                حذف
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ];

  const statementColumns: Column<OpenItemRow>[] = [
    { key: 'kind', header: 'النوع', render: (row) => kindLabel(row.kind) },
    { key: 'date', header: 'التاريخ', render: (row) => num(row.documentDate) },
    { key: 'memo', header: 'البيان', render: (row) => row.memo || row.reference || '—' },
    { key: 'original', header: 'الأصلي', numeric: true, render: (row) => num(row.originalAmount) },
    { key: 'remaining', header: 'المتبقي', numeric: true, render: (row) => num(row.remaining) },
    { key: 'status', header: 'الحالة', render: statusBadge },
  ];

  const agingColumns: Column<AgingDoc['lines'][number]>[] = [
    { key: 'party', header: 'الطرف', render: (row) => row.partyName },
    { key: 'kind', header: 'النوع', render: (row) => kindLabel(row.kind) },
    { key: 'date', header: 'التاريخ', render: (row) => num(row.documentDate) },
    { key: 'days', header: 'الأيام', numeric: true, render: (row) => num(row.days) },
    { key: 'bucket', header: 'الفترة', render: (row) => aging?.buckets.find((bucket) => bucket.code === row.bucket)?.name || row.bucket },
    { key: 'remaining', header: 'المتبقي', numeric: true, render: (row) => num(row.remaining) },
  ];

  const revalueColumns: Column<RevalueLine>[] = [
    { key: 'party', header: 'الطرف', render: (row) => row.partyName },
    { key: 'kind', header: 'النوع', render: (row) => kindLabel(row.kind) },
    { key: 'remaining', header: 'المتبقي', numeric: true, render: (row) => num(`${row.remaining} ${row.currency}`) },
    { key: 'gap', header: 'فرق الترجمة', numeric: true, defaultHidden: false, render: (row) => num(row.gap) },
  ];

  return (
    <div className="ent-page">
      <header className="tp-head"><h1 className="tp-title">الذمم والتحصيل</h1></header>
      {toasts}
      <div className="ent-tabs" role="tablist" aria-label="الذمم والتحصيل">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === 'new' ? false : tab === item.id}
            onClick={() => {
              if (item.id === 'new') {
                setCollectRow(null);
                setTab('list');
                setNewOpen(true);
                return;
              }
              setNewOpen(false);
              setCollectRow(null);
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {newOpen && canWrite ? (
        <Modal
          wide
          title="بند جديد"
          onClose={() => setNewOpen(false)}
          footer={
            <>
              <button type="button" className="ent-quiet" onClick={() => setNewOpen(false)}>إلغاء</button>
              <button type="submit" form="open-item-new" className="ent-primary" disabled={saving || !partyId || !(Number(amount) > 0)}>
                {saving ? 'جارٍ الحفظ' : 'حفظ'}
              </button>
            </>
          }
        >
          <form
            id="open-item-new"
            className="ent-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field label="الطرف">
              <Select
                value={party}
                onChange={(value) => {
                  setParty(value as 'CUSTOMER' | 'SUPPLIER');
                  setKind(value === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE');
                  setPartyId('');
                }}
                options={[
                  { value: 'CUSTOMER', label: 'زبون' },
                  { value: 'SUPPLIER', label: 'مورد' },
                ]}
              />
            </Field>
            <Field label="الاسم">
              <Select value={partyId} onChange={setPartyId} placeholder="اختر" options={partyOptions} />
            </Field>
            <Field label="النوع">
              <Select
                value={kind}
                onChange={(value) => setKind(value as OpenItemRow['kind'])}
                options={KINDS.filter((row) => (party === 'CUSTOMER' ? row.value === 'RECEIVABLE' : row.value !== 'RECEIVABLE'))}
              />
            </Field>
            <Field label="تاريخ المستند">
              <Input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
            </Field>
            <Field label="المبلغ">
              <Input className="is-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="التسوية">
              <Select
                value={settlementMode}
                onChange={(value) => setSettlementMode(value as 'CASH' | 'GOODS')}
                options={[
                  { value: 'CASH', label: 'نقد' },
                  { value: 'GOODS', label: 'بضاعة' },
                ]}
              />
            </Field>
            <Field label="بيان">
              <Input value={memo} onChange={(event) => setMemo(event.target.value)} />
            </Field>
          </form>
        </Modal>
      ) : null}

      {tab === 'list' ? (
        <>
          <div className="ent-ribbon">
            <Input className="ent-search" value={listQuery} placeholder="بحث بالطرف أو البيان" onChange={(event) => setListQuery(event.target.value)} />
            {canWrite ? (
              <div className="ent-ribbon-end">
                <button type="button" className="ent-primary" onClick={() => setNewOpen(true)}>+ بند جديد</button>
              </div>
            ) : null}
          </div>
          <DataTable tableId="open-items" columns={listColumns} rows={visibleRows} rowKey={(row) => row.id} empty={ready ? 'لا بنود مفتوحة.' : 'جاري تحميل البنود...'} />
          {collectRow && canWrite ? (
            <Modal
              wide
              title={collectRow.kind === 'PAYABLE' ? `تسجيل دفعة · ${collectRow.partyName}` : `قبض دفعة · ${collectRow.partyName}`}
              onClose={() => setCollectRow(null)}
              footer={
                <>
                  <button type="button" className="ent-quiet" onClick={() => setCollectRow(null)}>إلغاء</button>
                  <button type="submit" form="open-item-collect" className="ent-primary" disabled={saving || !projectId || !(Number(collectAmount) > 0)}>
                    {saving ? 'جارٍ الحفظ' : collectRow.kind === 'PAYABLE' ? 'تسجيل الدفع' : 'تسجيل القبض'}
                  </button>
                </>
              }
            >
              <form
                id="open-item-collect"
                onSubmit={(event) => {
                  event.preventDefault();
                  void collect();
                }}
              >
                <p>المتبقي {collectRow.remaining} {collectRow.currency}</p>
                <div className="ui-form-grid">
                  <Field label="المبلغ">
                    <Input inputMode="decimal" value={collectAmount} onChange={(event) => setCollectAmount(event.target.value)} />
                  </Field>
                  <Field label="التاريخ">
                    <Input type="date" value={collectDate} onChange={(event) => setCollectDate(event.target.value)} />
                  </Field>
                  <Field label="المشروع">
                    <Select
                      value={projectId}
                      onChange={setProjectId}
                      placeholder="اختر"
                      options={collectProjects.map((row) => ({ value: row.id, label: row.name }))}
                    />
                  </Field>
                  <Field label="الصندوق">
                    <Select
                      value={fund}
                      onChange={(value) => setFund(value as OperationFund)}
                      options={[
                        { value: 'VAULT', label: 'الخزنة' },
                        { value: 'SHAM_CASH', label: 'شام كاش' },
                      ]}
                    />
                  </Field>
                </div>
              </form>
            </Modal>
          ) : null}
        </>
      ) : null}

      {tab === 'statement' ? (
        <>
          <div className="ent-ribbon">
            <Combobox
              value={statementId}
              placeholder="ابحث عن زبون أو مورد"
              options={statementOptions}
              onChange={(value) => void loadStatement(value)}
            />
            {statement ? (
              <div className="ent-balance">
                <span>الرصيد الإجمالي</span>
                <b>{statement.net}</b>
              </div>
            ) : null}
          </div>
          {statementEmpty ? <p className="ent-empty">لا بنود لهذا الطرف.</p> : statement ? <DataTable tableId="open-items-statement" columns={statementColumns} rows={statement.items} rowKey={(row) => row.id} /> : <p className="ent-empty">اختر الطرف لعرض الكشف والرصيد.</p>}
        </>
      ) : null}

      {tab === 'aging' ? (
        <>
          <form
            className="ent-ribbon"
            onSubmit={(event) => {
              event.preventDefault();
              void loadAging(asOf);
            }}
          >
            <Field label="حتى تاريخ">
              <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </Field>
            <button type="submit" className="ent-primary">تحديث</button>
          </form>
          {aging ? (
            <>
              <div className="ent-kpis">
                {aging.buckets.slice(0, 4).map((bucket) => (
                  <article key={bucket.code} className="ent-kpi">
                    <span>{bucket.name}</span>
                    <strong>{bucket.amount}</strong>
                  </article>
                ))}
              </div>
              <DataTable tableId="open-items-aging" columns={agingColumns} rows={aging.lines} rowKey={(row) => row.id} empty="لا ذمم مفتوحة حتى هذا التاريخ." />
            </>
          ) : <p className="ent-empty">جاري تحميل الأعمار...</p>}
        </>
      ) : null}

      {tab === 'revalue' ? (
        <Card title="إعادة تقييم البنود" chip="المحاسبة">
          <form
            className="ui-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void loadRevalue();
            }}
          >
            <Field label="حتى تاريخ">
              <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </Field>
            <Field label="سعر الإقفال">
              <Input inputMode="decimal" value={rate} placeholder="ل.س / دولار" onChange={(event) => setRate(event.target.value)} />
            </Field>
            <div className="ui-span-all">
              <Button variant="primary" type="submit">عرض</Button>
            </div>
          </form>
          {revalue ? (
            <>
              <h3 className="ui-note">بنود نقدية تُترجم بسعر الإقفال</h3>
              {revalue.monetary.length === 0 ? <EmptyState title="لا بنود نقدية مفتوحة." /> : (
                <DataTable tableId="open-items-revalue" columns={revalueColumns} rows={revalue.monetary} rowKey={(row) => row.id} />
              )}
              <h3 className="ui-note">سلف تُسوّى ببضاعة وتبقى بسعر تاريخها</h3>
              {revalue.goods.length === 0 ? <EmptyState title="لا سلف بضاعة مفتوحة." /> : (
                <DataTable tableId="open-items-goods" columns={revalueColumns.slice(0, 3)} rows={revalue.goods} rowKey={(row) => row.id} />
              )}
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
