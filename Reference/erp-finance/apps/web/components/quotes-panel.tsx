'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CustomerRow,
  OpportunityRow,
  ProductRow,
  QuoteRow,
  acceptQuote,
  createQuote,
  getProductCatalog,
  getQuote,
  listCustomers,
  listOpportunities,
  listQuotes,
  listWarehouses,
  setQuoteStatus,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Field, Input } from './ui/field';
import { Select } from './ui/select';
import { Combobox } from './ui/combobox';
import { Button } from './ui/button';
import { Badge, BadgeTone } from './ui/badge';
import { StatCard, StatGrid } from './ui/stat-card';
import { FilterPills } from './ui/page-toolbar';
import { DocumentPage, ListPage, SummaryList, SummaryRow, useLinesKeyboard } from './ui/templates';
import { DocumentStepper, QUOTE_STEPS, quoteStep } from './ui/document-stepper';
import { PrintButton } from './print/print-layout';
import './enterprise.css';

const OPEN_INVOICE = 'unigate.openSalesInvoice';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة',
  SENT: 'مُرسل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'ok',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

type DraftLine = { key: string; productId: string; quantity: string; unitPrice: string; discount: string };
type QuoteDetail = Awaited<ReturnType<typeof getQuote>>;

function lineKey() {
  return Math.random().toString(36).slice(2);
}

function blankLine(): DraftLine {
  return { key: lineKey(), productId: '', quantity: '1', unitPrice: '', discount: '' };
}

function badge(status: string) {
  if (status === 'ACCEPTED') return 'is-paid';
  if (status === 'SENT') return 'is-unpaid';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'is-void';
  return 'is-draft';
}

function money(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function QuotesPanel({ canWrite }: { canWrite: boolean }) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'SYP'>('USD');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const kb = useLinesKeyboard(() => setLines((rows) => [...rows, blankLine()]));

  async function reload() {
    const sites = await listWarehouses();
    const catalog = await getProductCatalog({ warehouseId: sites[0]?.id, filter: 'all' });
    const [quoteRows, customerRows, opportunityRows] = await Promise.all([
      listQuotes(),
      listCustomers(),
      listOpportunities(),
    ]);
    setQuotes(quoteRows);
    setCustomers(customerRows);
    setOpportunities(opportunityRows);
    setProducts(catalog.products.filter((row) => row.status === 'ACTIVE'));
  }

  useEffect(() => {
    reload()
      .then(() => {
        try {
          const raw = sessionStorage.getItem('unigate.quote.prefill');
          if (!raw) return;
          sessionStorage.removeItem('unigate.quote.prefill');
          const pre = JSON.parse(raw) as { customerId?: string; currency?: string; opportunityId?: string };
          if (!canWrite) return;
          setDetail(null);
          setCustomerId(pre.customerId || '');
          setOpportunityId(pre.opportunityId || '');
          setCurrency(pre.currency === 'SYP' ? 'SYP' : 'USD');
          setNotes('');
          setLines([blankLine()]);
          setCreating(true);
        } catch {
          /* ignore bad prefill */
        }
      })
      .catch((error) => setMessage(masterErrorMessage(error)));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim();
    return quotes.filter((row) => {
      if (status !== 'ALL' && row.status !== status) return false;
      if (!needle) return true;
      return `${row.number} ${row.customerName} ${row.version}`.includes(needle);
    });
  }, [quotes, query, status]);

  function stageOf(row: QuoteRow) {
    return opportunities.find((item) => item.id === row.opportunityId)?.stage || '';
  }

  function canConvert(row: QuoteRow) {
    if (!canWrite || row.salesInvoiceId) return false;
    if (row.status === 'REJECTED' || row.status === 'EXPIRED') return false;
    return row.status === 'ACCEPTED' || stageOf(row) === 'WON';
  }

  function canAccept(row: QuoteRow) {
    if (!canWrite || row.salesInvoiceId || canConvert(row)) return false;
    return row.status === 'DRAFT' || row.status === 'SENT';
  }

  function openNew() {
    setDetail(null);
    setCustomerId('');
    setOpportunityId('');
    setCurrency('USD');
    setNotes('');
    setLines([blankLine()]);
    setCreating(true);
  }

  async function openRow(row: QuoteRow) {
    setCreating(false);
    try {
      setDetail(await getQuote(row.id));
    } catch (error) {
      setMessage(masterErrorMessage(error));
    }
  }

  function openInvoice(id: string) {
    sessionStorage.setItem(OPEN_INVOICE, id);
    window.location.hash = '#sales/sales';
  }

  async function accept(row: QuoteRow) {
    setBusy(row.id);
    try {
      await setQuoteStatus(row.id, 'ACCEPTED');
      setMessage('قُبل العرض. تحوّل المحتمل المطابق إلى زبون، ويمكن الآن تحويل العرض إلى فاتورة.');
      setDetail(null);
      await reload();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setBusy('');
    }
  }

  async function convert(row: QuoteRow) {
    setBusy(row.id);
    try {
      const result = await acceptQuote(row.id);
      sessionStorage.setItem(OPEN_INVOICE, result.invoiceId);
      window.location.hash = '#sales/sales';
    } catch (error) {
      setMessage(masterErrorMessage(error));
      setBusy('');
    }
  }

  async function send(row: QuoteRow) {
    setBusy(row.id);
    try {
      await setQuoteStatus(row.id, 'SENT');
      setMessage('أُرسل العرض.');
      if (detail?.id === row.id) setDetail(await getQuote(row.id));
      await reload();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setBusy('');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice || 0),
        discount: line.discount ? Number(line.discount) : 0,
      }));
    const opportunity = opportunities.find((row) => row.id === opportunityId);
    setBusy('new');
    try {
      await createQuote({
        customerId: opportunity?.customerId || customerId,
        opportunityId: opportunityId || undefined,
        currency,
        notes,
        lines: payload,
      });
      setCreating(false);
      setMessage('حُفظت مسودة العرض. لا قيد ولا مخزون ولا صندوق.');
      await reload();
    } catch (error) {
      setMessage(masterErrorMessage(error));
    } finally {
      setBusy('');
    }
  }

  const active = detail ? quotes.find((row) => row.id === detail.id) || null : null;
  const draftSubtotal = lines.reduce((sum, line) => {
    const qty = Number(line.quantity);
    const price = Number(line.unitPrice || 0);
    const discount = Number(line.discount || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
    return sum + Math.max(0, qty * price - (Number.isFinite(discount) ? discount : 0));
  }, 0);
  const docOpen = creating || Boolean(detail && active);

  function closeDoc() {
    setCreating(false);
    setDetail(null);
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const note = message ? <p className="ui-note">{message}</p> : null;

  if (docOpen) {
    const stage = creating ? 'DRAFT' : quoteStep(active!.status, Boolean(active!.salesInvoiceId));
    return (
      <div className="ui-page">
        {note}
        <DocumentPage
          formId="quote-doc"
          onSubmit={save}
          canSave={creating && canWrite && busy !== 'new'}
          onPrimary={!creating && active && canConvert(active) ? () => void convert(active) : undefined}
          backLabel="عروض الأسعار"
          onBack={closeDoc}
          title={creating ? 'عرض سعر جديد' : `عرض ${detail!.number}`}
          badge={
            creating ? (
              <Badge>مسودة جديدة</Badge>
            ) : (
              <Badge tone={STATUS_TONE[detail!.status] || 'neutral'}>{STATUS_LABEL[detail!.status] || detail!.status}</Badge>
            )
          }
          stage={stage}
          steps={QUOTE_STEPS}
          tools={
            !creating && detail ? (
              <PrintButton
                getDoc={() => ({
                  title: 'عرض سعر',
                  number: String(detail.number),
                  date: detail.validUntil || '',
                  currency: detail.currency,
                  total: String(detail.total),
                  status: STATUS_LABEL[detail.status] || detail.status,
                  partyLabel: 'الزبون',
                  partyName: detail.customerName,
                  meta: [['صالح حتى', detail.validUntil || '—']],
                  lines: detail.lines.map((l) => ({ name: l.productName, quantity: String(l.quantity), unitPrice: String(l.unitPrice), total: String(l.lineTotal) })),
                  notes: detail.notes,
                  signatures: ['مسؤول المبيعات', 'الزبون'],
                })}
              />
            ) : null
          }
          actions={
            creating ? (
              <Button variant="primary" type="submit" form="quote-doc" disabled={!canWrite || busy === 'new'}>
                {busy === 'new' ? 'جارٍ الحفظ' : 'حفظ المسودة'}
              </Button>
            ) : active ? (
              <>
                {active.status === 'DRAFT' && canWrite ? (
                  <Button variant="secondary" disabled={busy === active.id} onClick={() => void send(active)}>إرسال للزبون</Button>
                ) : null}
                {canAccept(active) ? (
                  <Button variant="secondary" disabled={busy === active.id} onClick={() => void accept(active)}>قبول العرض</Button>
                ) : null}
                {canConvert(active) ? (
                  <Button variant="primary" disabled={busy === active.id} onClick={() => void convert(active)}>تحويل إلى فاتورة مبيعات</Button>
                ) : null}
                {active.salesInvoiceId ? (
                  <Button variant="primary" onClick={() => openInvoice(active.salesInvoiceId!)}>فتح الفاتورة</Button>
                ) : null}
              </>
            ) : null
          }
          header={
            creating ? (
              <>
                <Field label="الزبون" className="is-span-2">
                  <Combobox
                    value={customerId}
                    placeholder="ابحث عن الزبون"
                    options={customers.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name, keywords: row.phone }))}
                    onChange={setCustomerId}
                  />
                </Field>
                <Field label="الفرصة" className="is-span-2">
                  <Select
                    value={opportunityId}
                    placeholder="بلا فرصة"
                    onChange={(id) => {
                      setOpportunityId(id);
                      const row = opportunities.find((item) => item.id === id);
                      if (row) setCustomerId(row.customerId);
                    }}
                    options={opportunities.map((row) => ({ value: row.id, label: `${row.customerName} — ${row.title}` }))}
                  />
                </Field>
                <Field label="العملة">
                  <Select
                    value={currency}
                    options={[{ value: 'USD', label: 'دولار' }, { value: 'SYP', label: 'ليرة' }]}
                    onChange={(value) => setCurrency(value as 'USD' | 'SYP')}
                  />
                </Field>
                <Field label="ملاحظات" className="is-span-3">
                  <Input value={notes} placeholder="أضف ملاحظات عرض السعر..." onChange={(event) => setNotes(event.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="الزبون" className="is-span-2"><Input value={detail!.customerName} disabled readOnly /></Field>
                <Field label="الحالة"><Input value={STATUS_LABEL[detail!.status] || detail!.status} disabled readOnly /></Field>
                <Field label="العملة" hint={detail!.fxRate ? `سعر الصرف المسجل ${String(detail!.fxRate)}` : undefined}>
                  <Input value={detail!.currency} disabled readOnly />
                </Field>
                <Field label="صالح حتى"><Input value={detail!.validUntil || '—'} disabled readOnly /></Field>
                <Field label="ملاحظات" className="is-span-3"><Input value={detail!.notes || '—'} disabled readOnly /></Field>
              </>
            )
          }
          lines={
            <div ref={kb.ref} onKeyDown={kb.onKeyDown} className="dp-lines-inner">
              <div className="dp-lines-bar">
                <h3>البنود</h3>
                {creating ? (
                  <Button variant="secondary" onClick={() => { setLines((rows) => [...rows, blankLine()]); kb.focusLastItem(); }}>
                    + بند جديد
                  </Button>
                ) : null}
              </div>
              <table className="dp-lines-table">
                <colgroup>
                  <col />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 130 }} />
                  {creating ? <col style={{ width: 120 }} /> : null}
                  <col style={{ width: 120 }} />
                  {creating ? <col style={{ width: 44 }} /> : null}
                </colgroup>
                <thead>
                  <tr>
                    <th className="is-item">الصنف</th>
                    <th className="is-qty">الكمية</th>
                    <th className="is-price">السعر</th>
                    {creating ? <th className="is-disc">الخصم</th> : null}
                    <th className="is-sum is-num">الإجمالي</th>
                    {creating ? <th className="is-x" aria-label="حذف"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {creating
                    ? lines.map((line) => {
                        const qty = Number(line.quantity);
                        const price = Number(line.unitPrice || 0);
                        const discount = Number(line.discount || 0);
                        const sum = Number.isFinite(qty) && Number.isFinite(price) ? Math.max(0, qty * price - (Number.isFinite(discount) ? discount : 0)) : 0;
                        return (
                          <tr key={line.key}>
                            <td className="is-item">
                              <Combobox
                                value={line.productId}
                                placeholder="ابحث عن الصنف"
                                options={products.map((row) => ({ value: row.id, label: row.name, keywords: `${row.sku} ${row.barcode || ''}` }))}
                                onChange={(productId) => {
                                  const product = products.find((row) => row.id === productId);
                                  patchLine(line.key, { productId, unitPrice: line.unitPrice || product?.salePrice || '' });
                                }}
                              />
                            </td>
                            <td className="is-qty"><Input className="is-amount" inputMode="decimal" value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} /></td>
                            <td className="is-price"><Input className="is-amount" inputMode="decimal" value={line.unitPrice} onChange={(event) => patchLine(line.key, { unitPrice: event.target.value })} /></td>
                            <td className="is-disc"><Input className="is-amount" inputMode="decimal" placeholder="0" value={line.discount} onChange={(event) => patchLine(line.key, { discount: event.target.value })} /></td>
                            <td className="is-sum is-num">{money(sum)}</td>
                            <td className="is-x">
                              {lines.length > 1 ? (
                                <button type="button" className="dp-line-del" aria-label="حذف السطر" title="حذف السطر" onClick={() => setLines((rows) => rows.filter((item) => item.key !== line.key))}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                  </svg>
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    : detail!.lines.map((line) => (
                        <tr key={`${line.productId}-${line.productName}`}>
                          <td className="is-item">{line.productName}</td>
                          <td className="is-qty is-num">{line.quantity}</td>
                          <td className="is-price is-num">{line.unitPrice}</td>
                          <td className="is-sum is-num">{line.lineTotal}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {creating ? (
                <p className="dp-lines-hint">
                  <kbd>Enter</kbd> الحقل التالي / سطر جديد · <kbd>Ctrl</kbd>+<kbd>S</kbd> حفظ المسودة
                </p>
              ) : null}
            </div>
          }
          totals={
            <SummaryList>
              <SummaryRow net label="الصافي" value={`${creating ? money(draftSubtotal) : money(Number(detail!.total))} ${creating ? currency : detail!.currency}`} />
            </SummaryList>
          }
          related={
            !creating && active?.salesInvoiceId ? (
              <section className="dp-card">
                <h3>الفاتورة المرتبطة</h3>
                <p className="ji-state">حُوِّل هذا العرض إلى فاتورة مبيعات.</p>
                <Button variant="secondary" onClick={() => openInvoice(active.salesInvoiceId!)}>فتح الفاتورة</Button>
              </section>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="ui-page">
      {note}
      <ListPage
        title="عروض الأسعار"
        newLabel="+ عرض جديد"
        onNew={canWrite ? openNew : undefined}
        kpis={
          <StatGrid>
            <StatCard label="عروض ضمن العرض" value={visible.length} />
            <StatCard label="مسودات" value={visible.filter((row) => row.status === 'DRAFT').length} />
            <StatCard label="مُرسلة" value={visible.filter((row) => row.status === 'SENT').length} />
            <StatCard label="مقبولة" value={visible.filter((row) => row.status === 'ACCEPTED').length} />
          </StatGrid>
        }
        search={query}
        onSearch={setQuery}
        searchPlaceholder="بحث بالرقم أو الزبون"
        filters={
          <FilterPills
            value={status}
            onChange={setStatus}
            options={[['ALL', 'الكل'], ['DRAFT', STATUS_LABEL.DRAFT], ['SENT', STATUS_LABEL.SENT], ['ACCEPTED', STATUS_LABEL.ACCEPTED], ['REJECTED', STATUS_LABEL.REJECTED]] as const}
          />
        }
        columns={[
          { key: 'number', header: 'الرقم', render: (row) => row.number },
          { key: 'version', header: 'النسخة', defaultHidden: true, render: (row) => row.version },
          { key: 'customer', header: 'الزبون', render: (row) => row.customerName },
          {
            key: 'status',
            header: 'الحالة',
            render: (row) => <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{STATUS_LABEL[row.status] || row.status}</Badge>,
          },
          { key: 'total', header: 'المجموع', numeric: true, render: (row) => `${row.total} ${row.currency}` },
          {
            key: 'actions',
            header: '',
            fixed: true,
            render: (row) => (
              <span className="ui-row-actions" onClick={(event) => event.stopPropagation()}>
                {canConvert(row) ? (
                  <Button variant="primary" disabled={busy === row.id} onClick={() => void convert(row)}>تحويل إلى فاتورة مبيعات</Button>
                ) : null}
                {canAccept(row) ? (
                  <Button variant="mini" disabled={busy === row.id} onClick={() => void accept(row)}>قبول العرض</Button>
                ) : null}
                {row.salesInvoiceId ? (
                  <Button variant="mini" onClick={() => openInvoice(row.salesInvoiceId!)}>فتح الفاتورة</Button>
                ) : null}
              </span>
            ),
          },
        ]}
        rows={visible}
        tableId="crm-quotes"
        rowKey={(row) => row.id}
        onOpen={(row) => void openRow(row)}
        empty="لا عروض في هذا العرض."
      />
    </div>
  );
}
