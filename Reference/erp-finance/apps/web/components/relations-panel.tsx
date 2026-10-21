'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CustomerRow,
  LeadRow,
  OpportunityRow,
  convertLead,
  createLead,
  createOpportunity,
  listCustomers,
  listLeads,
  listOpportunities,
  updateOpportunity,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Badge, BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { Column } from './ui/data-table';
import { Field, Input, Textarea } from './ui/field';
import { Modal, ModalFooter } from './ui/modal';
import { FilterPills } from './ui/page-toolbar';
import { Select } from './ui/select';
import { StatCard, StatGrid } from './ui/stat-card';
import { ListPage } from './ui/templates';
import './relations-panel.css';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STAGE_ORDER = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

const STAGES: Record<string, string> = {
  NEW: 'جديدة',
  QUALIFIED: 'مؤهلة',
  PROPOSAL: 'عرض',
  NEGOTIATION: 'تفاوض',
  WON: 'رابحة',
  LOST: 'خاسرة',
};

const STAGE_TONE: Record<string, BadgeTone> = {
  NEW: 'neutral',
  QUALIFIED: 'info',
  PROPOSAL: 'info',
  NEGOTIATION: 'warn',
  WON: 'ok',
  LOST: 'danger',
};

const CURRENCIES = ['USD', 'SYP', 'EUR', 'TRY'];

type View = 'kanban' | 'table';
type StageFilter = 'ALL' | (typeof STAGE_ORDER)[number];

type OppForm = {
  id: string | null;
  customerId: string;
  title: string;
  stage: string;
  expected: string;
  probability: string;
  currency: string;
  closeDate: string;
  lossReason: string;
};

const EMPTY_FORM: OppForm = {
  id: null,
  customerId: '',
  title: '',
  stage: 'NEW',
  expected: '',
  probability: '50',
  currency: 'USD',
  closeDate: today(),
  lossReason: '',
};

function amountOf(row: OpportunityRow) {
  const value = Number(row.expectedAmount);
  return Number.isFinite(value) ? value : 0;
}

function fmt(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function sumByCurrency(rows: OpportunityRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) || 0) + amountOf(row));
  return [...totals.entries()];
}

function totalsText(rows: OpportunityRow[]) {
  const parts = sumByCurrency(rows);
  if (parts.length === 0) return '0';
  return parts.map(([currency, value]) => `${fmt(value)} ${currency}`).join(' · ');
}

export const QUOTE_PREFILL_KEY = 'unigate.quote.prefill';

function goQuote(row: { id: string; customerId: string; currency: string }) {
  try {
    sessionStorage.setItem(
      QUOTE_PREFILL_KEY,
      JSON.stringify({ customerId: row.customerId, currency: row.currency, opportunityId: row.id }),
    );
  } catch {
    /* storage unavailable */
  }
  window.location.hash = '#crm/quotes';
}

function isStale(row: OpportunityRow) {
  return !['WON', 'LOST'].includes(row.stage) && Boolean(row.closeDate) && row.closeDate.slice(0, 10) < today();
}

export function RelationsPanel({ canWrite, screen }: { canWrite: boolean; screen: 'leads' | 'pipeline' }) {
  return screen === 'leads' ? <LeadsScreen canWrite={canWrite} /> : <PipelineScreen canWrite={canWrite} />;
}

/* ───────────────────────── Pipeline ───────────────────────── */

function PipelineScreen({ canWrite }: { canWrite: boolean }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [view, setView] = useState<View>('kanban');
  const [form, setForm] = useState<OppForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function reload() {
    const [customerRows, opportunityRows] = await Promise.all([listCustomers(), listOpportunities()]);
    setCustomers(customerRows);
    setRows(opportunityRows);
    setReady(true);
  }

  useEffect(() => {
    reload().catch((error) => {
      setReady(true);
      setMessage(masterErrorMessage(error));
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === 'table' && stage !== 'ALL' && row.stage !== stage) return false;
      if (!needle) return true;
      return `${row.title} ${row.customerName} ${row.ownerName}`.toLowerCase().includes(needle);
    });
  }, [rows, query, stage, view]);

  const open = rows.filter((row) => !['WON', 'LOST'].includes(row.stage));
  const won = rows.filter((row) => row.stage === 'WON');
  const lost = rows.filter((row) => row.stage === 'LOST');
  const closed = won.length + lost.length;
  const rate = closed ? Math.round((won.length / closed) * 100) : 0;
  const followUp = open.filter(isStale);

  function openNew() {
    setFormError('');
    setForm({ ...EMPTY_FORM, closeDate: today() });
  }

  function openEdit(row: OpportunityRow, nextStage?: string) {
    setFormError('');
    setForm({
      id: row.id,
      customerId: row.customerId,
      title: row.title,
      stage: nextStage ?? row.stage,
      expected: String(amountOf(row)),
      probability: String(row.probability),
      currency: row.currency,
      closeDate: row.closeDate ? row.closeDate.slice(0, 10) : today(),
      lossReason: row.lossReason || '',
    });
  }

  async function moveStage(row: OpportunityRow, next: string) {
    if (next === row.stage || !canWrite) return;
    if (next === 'LOST') {
      openEdit(row, 'LOST');
      return;
    }
    try {
      await updateOpportunity(row.id, {
        customerId: row.customerId,
        title: row.title,
        stage: next,
        expectedAmount: amountOf(row),
        probability: next === 'WON' ? 100 : row.probability,
        currency: row.currency,
        closeDate: row.closeDate ? row.closeDate.slice(0, 10) : undefined,
        lossReason: '',
      });
      setMessage(`نُقلت «${row.title}» إلى مرحلة ${STAGES[next]}.`);
      await reload();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  async function save() {
    if (!form) return;
    if (!form.customerId) return setFormError('اختر الزبون.');
    if (!form.title.trim()) return setFormError('أدخل عنوان الفرصة.');
    if (form.stage === 'LOST' && !form.lossReason.trim()) return setFormError('سبب الخسارة مطلوب.');
    const payload = {
      customerId: form.customerId,
      title: form.title.trim(),
      stage: form.stage,
      expectedAmount: Number(form.expected || 0),
      probability: Number(form.probability || 0),
      currency: form.currency,
      closeDate: form.closeDate || undefined,
      lossReason: form.stage === 'LOST' ? form.lossReason.trim() : '',
    };
    setSaving(true);
    setFormError('');
    try {
      if (form.id) await updateOpportunity(form.id, payload);
      else await createOpportunity(payload);
      setForm(null);
      setMessage(form.id ? 'حُفظت تعديلات الفرصة.' : 'أُضيفت الفرصة.');
      await reload();
    } catch (error) {
      setFormError(masterErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<OpportunityRow>[] = [
    { key: 'title', header: 'الصفقة', render: (row) => <strong>{row.title}</strong> },
    { key: 'customer', header: 'الزبون', render: (row) => row.customerName || '—' },
    { key: 'stage', header: 'المرحلة', render: (row) => <Badge tone={STAGE_TONE[row.stage] ?? 'neutral'}>{STAGES[row.stage] || row.stage}</Badge> },
    {
      key: 'amount',
      header: 'القيمة المتوقعة',
      numeric: true,
      render: (row) => (
        <span dir="ltr" className="crm-num">
          {fmt(amountOf(row))} {row.currency}
        </span>
      ),
    },
    { key: 'probability', header: 'الاحتمال', numeric: true, render: (row) => <span dir="ltr" className="crm-num">{row.probability}%</span> },
    {
      key: 'closeDate',
      header: 'الإغلاق المتوقع',
      render: (row) => (
        <span dir="ltr" className="crm-num">
          {row.closeDate ? row.closeDate.slice(0, 10) : '—'}
        </span>
      ),
    },
    { key: 'owner', header: 'المسؤول', defaultHidden: true, render: (row) => row.ownerName || '—' },
    { key: 'loss', header: 'سبب الخسارة', defaultHidden: true, render: (row) => row.lossReason || '—' },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) => (
        <Button
          variant="mini"
          onClick={(event) => {
            event.stopPropagation();
            goQuote(row);
          }}
        >
          عرض سعر
        </Button>
      ),
    },
  ];

  const kpis = (
    <StatGrid>
      <StatCard label="الفرص النشطة" value={open.length} />
      <StatCard label="القيمة المتوقعة (مفتوحة)" value={<span dir="ltr" className="crm-num">{totalsText(open)}</span>} />
      <StatCard label="معدل التحويل" value={<span dir="ltr" className="crm-num">{rate}%</span>} hint={`${won.length} رابحة من ${closed} مغلقة`} />
      <StatCard label="تحتاج متابعة" value={followUp.length} hint="تجاوزت تاريخ الإغلاق المتوقع" negative={followUp.length > 0} />
    </StatGrid>
  );

  const stageFilters = (
    <>
      {view === 'table' ? (
      <FilterPills
        value={stage}
        onChange={setStage}
        options={[['ALL', 'الكل'], ...STAGE_ORDER.map((id) => [id, STAGES[id]] as const)] as readonly (readonly [StageFilter, string])[]}
      />
      ) : null}
      <FilterPills
        value={view}
        onChange={setView}
        options={[['kanban', 'عرض المسار Kanban'], ['table', 'عرض الجدول']] as const}
      />
    </>
  );

  const stagesShown = STAGE_ORDER;

  return (
    <div className="ui-page crm">
      {message ? <p className="ui-note" onClick={() => setMessage('')}>{message}</p> : null}
      {view === 'table' ? (
        <ListPage
          title="مسار الصفقات"
          newLabel="+ فرصة / عميل محتمل جديد"
          onNew={canWrite ? openNew : undefined}
          kpis={kpis}
          search={query}
          onSearch={setQuery}
          searchPlaceholder="بحث بالصفقة أو الزبون"
          filters={stageFilters}
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          onOpen={(row) => (canWrite ? openEdit(row) : undefined)}
          ready={ready}
          tableId="crm-leads"
          empty="لا فرص مطابقة."
        />
      ) : (
        <div className="ent-page lp">
          <header className="tp-head">
            <h1 className="tp-title">مسار الصفقات</h1>
            <div className="tp-head-end">
              {canWrite ? (
                <Button variant="primary" onClick={openNew}>
                  + فرصة / عميل محتمل جديد
                </Button>
              ) : null}
            </div>
          </header>
          <div className="lp-kpis">{kpis}</div>
          <div className="crm-toolbar">
            <Input className="crm-search" value={query} placeholder="بحث بالصفقة أو الزبون" onChange={(event) => setQuery(event.target.value)} />
            {stageFilters}
          </div>
          {!ready ? <p className="ui-datatable-empty">جارٍ التحميل…</p> : null}
          <div className="crm-board">
            {stagesShown.map((id) => {
              const items = filtered.filter((row) => row.stage === id);
              return (
                <section key={id} className={`crm-col is-${id.toLowerCase()}`}>
                  <header className="crm-col-head">
                    <div className="crm-col-title">
                      <Badge tone={STAGE_TONE[id]}>{STAGES[id]}</Badge>
                      <span className="crm-col-count">{items.length}</span>
                    </div>
                    <div className="crm-col-sum" dir="ltr">{totalsText(items)}</div>
                  </header>
                  <div className="crm-col-body">
                    {items.length === 0 ? <p className="crm-col-empty">لا صفقات</p> : null}
                    {items.map((row) => (
                      <article key={row.id} className={`crm-card${isStale(row) ? ' is-stale' : ''}`}>
                        <button type="button" className="crm-card-main" onClick={() => (canWrite ? openEdit(row) : undefined)}>
                          <strong>{row.title}</strong>
                          <span className="crm-card-cust">{row.customerName || '—'}</span>
                          <span className="crm-card-amt" dir="ltr">
                            {fmt(amountOf(row))} {row.currency}
                          </span>
                          <span className="crm-card-meta">
                            <span dir="ltr">{row.probability}%</span>
                            <span dir="ltr">{row.closeDate ? row.closeDate.slice(0, 10) : '—'}</span>
                          </span>
                        </button>
                        {canWrite ? (
                          <div className="crm-card-foot">
                            <Select
                              value={row.stage}
                              onChange={(next) => void moveStage(row, next)}
                              options={STAGE_ORDER.map((s) => ({ value: s, label: STAGES[s] }))}
                            />
                            <Button variant="mini" onClick={() => { goQuote(row); }}>
                              عرض سعر
                            </Button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {form ? (
        <Modal
          wide
          title={form.id ? 'تعديل الفرصة' : 'فرصة / عميل محتمل جديد'}
          onClose={() => setForm(null)}
          footer={
            <>
              {form.id ? (
                <Button
                  variant="secondary"
                  onClick={() => goQuote({ id: form.id ?? '', customerId: form.customerId, currency: form.currency })}
                >
                  إنشاء عرض سعر
                </Button>
              ) : null}
              <ModalFooter onCancel={() => setForm(null)} saveLabel="حفظ الفرصة" saving={saving} onSave={() => void save()} />
            </>
          }
        >
          <div className="crm-form">
            <Field label="الزبون">
              <Select
                value={form.customerId}
                onChange={(value) => setForm({ ...form, customerId: value })}
                placeholder="اختر الزبون"
                options={customers.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Field>
            <Field label="عنوان الفرصة">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
            <Field label="المرحلة">
              <Select
                value={form.stage}
                onChange={(value) => setForm({ ...form, stage: value })}
                options={STAGE_ORDER.map((s) => ({ value: s, label: STAGES[s] }))}
              />
            </Field>
            <Field label="المبلغ المتوقع">
              <Input dir="ltr" inputMode="decimal" value={form.expected} onChange={(event) => setForm({ ...form, expected: event.target.value })} />
            </Field>
            <Field label="العملة">
              <Select value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
            <Field label="الاحتمال %">
              <Input dir="ltr" inputMode="numeric" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} />
            </Field>
            <Field label="تاريخ الإغلاق المتوقع">
              <Input dir="ltr" type="date" value={form.closeDate} onChange={(event) => setForm({ ...form, closeDate: event.target.value })} />
            </Field>
            {form.stage === 'LOST' ? (
              <Field label="سبب الخسارة" className="crm-form-wide">
                <Textarea value={form.lossReason} onChange={(event) => setForm({ ...form, lossReason: event.target.value })} />
              </Field>
            ) : null}
          </div>
          {formError ? <p className="ui-note">{formError}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Leads ───────────────────────── */

function LeadsScreen({ canWrite }: { canWrite: boolean }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | 'LEAD' | 'CONVERTED'>('ALL');
  const [form, setForm] = useState<{ name: string; phone: string; address: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function reload() {
    setLeads(await listLeads());
    setReady(true);
  }

  useEffect(() => {
    reload().catch((error) => {
      setReady(true);
      setMessage(masterErrorMessage(error));
    });
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((row) => {
      const converted = row.status === 'CONVERTED';
      if (status === 'LEAD' && converted) return false;
      if (status === 'CONVERTED' && !converted) return false;
      return !needle || `${row.name} ${row.phone} ${row.customerName}`.toLowerCase().includes(needle);
    });
  }, [leads, query, status]);

  async function save() {
    if (!form) return;
    if (!form.name.trim()) return setFormError('أدخل اسم المحتمل.');
    setSaving(true);
    setFormError('');
    try {
      await createLead({ name: form.name.trim(), phone: form.phone, address: form.address, notes: form.notes } as Parameters<typeof createLead>[0]);
      setForm(null);
      setMessage('أُضيف المحتمل.');
      await reload();
    } catch (error) {
      setFormError(masterErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<LeadRow>[] = [
    { key: 'name', header: 'الاسم', render: (row) => <strong>{row.name}</strong> },
    { key: 'phone', header: 'الهاتف', render: (row) => <span dir="ltr" className="crm-num">{row.phone || '—'}</span> },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => (row.status === 'CONVERTED' ? <Badge tone="ok">زبون</Badge> : <Badge tone="info">محتمل</Badge>),
    },
    { key: 'customer', header: 'الزبون', render: (row) => row.customerName || '—' },
    { key: 'owner', header: 'المسؤول', defaultHidden: true, render: (row) => row.ownerName || '—' },
    { key: 'address', header: 'العنوان', defaultHidden: true, render: (row) => row.address || '—' },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) =>
        row.status !== 'CONVERTED' && canWrite ? (
          <Button
            variant="mini"
            onClick={(event) => {
              event.stopPropagation();
              void convertLead(row.id)
                .then(async () => {
                  setMessage(`تحوّل ${row.name} إلى زبون.`);
                  await reload();
                })
                .catch((error) => setMessage(masterErrorMessage(error)));
            }}
          >
            تحويل لزبون
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="ui-page crm">
      {message ? <p className="ui-note" onClick={() => setMessage('')}>{message}</p> : null}
      <ListPage
        title="المحتملون"
        newLabel="+ فرصة / عميل محتمل جديد"
        onNew={canWrite ? () => { setFormError(''); setForm({ name: '', phone: '', address: '', notes: '' }); } : undefined}
        kpis={
          <StatGrid>
            <StatCard label="إجمالي المحتملين" value={leads.length} />
            <StatCard label="محتملون نشطون" value={leads.filter((row) => row.status !== 'CONVERTED').length} />
            <StatCard label="تحوّلوا إلى زبائن" value={leads.filter((row) => row.status === 'CONVERTED').length} />
          </StatGrid>
        }
        search={query}
        onSearch={setQuery}
        searchPlaceholder="بحث بالاسم أو الهاتف"
        filters={<FilterPills value={status} onChange={setStatus} options={[['ALL', 'الكل'], ['LEAD', 'محتمل'], ['CONVERTED', 'زبون']] as const} />}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        ready={ready}
        tableId="crm-prospects"
        empty="لا محتملين مطابقين."
      />
      {form ? (
        <Modal
          wide
          title="محتمل جديد"
          onClose={() => setForm(null)}
          footer={<ModalFooter onCancel={() => setForm(null)} saveLabel="إضافة" saving={saving} onSave={() => void save()} />}
        >
          <div className="crm-form">
            <Field label="الاسم">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="الهاتف">
              <Input dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="العنوان" className="crm-form-wide">
              <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label="ملاحظات" className="crm-form-wide">
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>
          </div>
          {formError ? <p className="ui-note">{formError}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}
