'use client';

import { OpsTable, OpsEmpty } from './ops-table';

import { OpsField, OpsInput, OpsTextarea } from './ops-field';

import { OpsButton } from './ops-button';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  CustomerRow,
  INCOME_FUNDS,
  LocationRow,
  NamedRecord,
  OperationFund,
  ProductRow,
  ProjectRow,
  RecordStatus,
  SalesInvoiceDetail,
  SalesInvoiceInput,
  SalesInvoiceStatus,
  SalesInvoiceSummary,
  createCustomer,
  createSalesInvoice,
  deleteCustomer,
  deleteSalesInvoice,
  getProductCatalog,
  getSalesInvoice,
  listCustomers,
  listSalesInvoices,
  listWarehouses,
  paySalesInvoice,
  postSalesInvoice,
  reverseSalesPayment,
  updateCustomer,
  updateSalesInvoice,
  voidSalesInvoice,
  WarehouseRow,
} from '../lib/api';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { addScannedLine, findScannedProduct } from '../lib/barcode';
import { BarcodeScan } from './barcode-scan';
import { ProductPicker } from './product-picker';
import { OpsSelect } from './ops-select';
import { useOpsToasts } from './ops-toasts';

const UNITS: Record<string, string> = {
  PIECE: 'قطعة',
  KG: 'كغ',
  METER: 'متر',
  LITER: 'لتر',
  BOX: 'صندوق',
  SET: 'طقم',
};

const STATUS_LABEL: Record<SalesInvoiceStatus, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحّلة',
  VOID: 'ملغاة',
};

const PAY_LABEL = { UNPAID: 'غير مقبوضة', PARTIAL: 'قبض جزئي', PAID: 'مقبوضة' };

type LineDraft = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
};

type DocForm = {
  transactionDate: string;
  customerId: string;
  warehouseId: string;
  currency: CurrencyCode;
  fxRate: string;
  locationId: string;
  notes: string;
  discount: string;
  lines: LineDraft[];
};

const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

function blankLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), productId: '', quantity: '1', unitPrice: '', discount: '' };
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function lineAmount(line: LineDraft) {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  const discount = Number(line.discount || 0);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return Math.max(0, qty * price - (Number.isFinite(discount) ? discount : 0));
}

export function SalesPanel({
  actor,
  locations,
  projects,
  banks,
  onChanged,
}: {
  actor: AuthUser;
  locations: LocationRow[];
  projects: ProjectRow[];
  banks: NamedRecord[];
  onChanged?: () => void;
}) {
  const { push, node: toasts } = useOpsToasts();
  const canManage = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const canWrite = actor.role !== 'MONITOR';
  const [tab, setTab] = useState<'invoices' | 'customers'>('invoices');
  const [rows, setRows] = useState<SalesInvoiceSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SalesInvoiceStatus | 'ALL'>('ALL');
  const [ready, setReady] = useState(false);
  const [doc, setDoc] = useState<SalesInvoiceDetail | null>(null);
  const [form, setForm] = useState<DocForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerRow | 'new' | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState<null | { kind: 'void' } | { kind: 'reverse'; paymentId: string }>(null);
  const [reason, setReason] = useState('');

  async function reload() {
    const [invoices, people, sites] = await Promise.all([
      listSalesInvoices({
        status: status === 'ALL' ? undefined : status,
        q: query.trim() || undefined,
      }),
      listCustomers(),
      listWarehouses(),
    ]);
    setRows(invoices);
    setCustomers(people);
    setWarehouses(sites.filter((site) => site.status === 'ACTIVE' || canManage));
    setReady(true);
  }

  useEffect(() => {
    reload().catch((error) => push(masterErrorMessage(error), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const activeWarehouse = form?.warehouseId || warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id;

  useEffect(() => {
    if (!activeWarehouse) return;
    getProductCatalog({ warehouseId: activeWarehouse, filter: 'all' })
      .then((result) => setProducts(result.products.filter((item) => item.status === 'ACTIVE')))
      .catch(() => setProducts([]));
  }, [activeWarehouse]);

  const incomeProjects = projects.filter((project) => project.status === 'ACTIVE' && project.showIn.includes('INCOME'));

  function openNew() {
    const warehouseId = warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id || '';
    setDoc(null);
    setForm({
      transactionDate: today(),
      customerId: '',
      warehouseId,
      currency: 'USD',
      fxRate: '',
      locationId: actor.locationId || locations[0]?.id || '',
      notes: '',
      discount: '',
      lines: [blankLine()],
    });
  }

  async function openExisting(id: string) {
    const detail = await getSalesInvoice(id);
    setDoc(detail);
    setForm({
      transactionDate: detail.transactionDate,
      customerId: detail.customerId,
      warehouseId: detail.warehouseId,
      currency: detail.currency,
      fxRate: detail.fxRate ? String(Number(detail.fxRate)) : '',
      locationId: detail.locationId || '',
      notes: detail.notes,
      discount: detail.discount === '0' ? '' : detail.discount,
      lines: detail.lines.map((line) => ({
        key: line.id,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount === '0' ? '' : line.discount,
      })),
    });
  }

  function payload(): SalesInvoiceInput | null {
    if (!form) return null;
    const lines = form.lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discount: line.discount ? Number(line.discount) : 0,
      }));
    return {
      transactionDate: form.transactionDate,
      customerId: form.customerId,
      warehouseId: form.warehouseId,
      currency: form.currency,
      ...(form.fxRate ? { fxRate: Number(form.fxRate) } : {}),
      notes: form.notes,
      discount: form.discount ? Number(form.discount) : 0,
      locationId: actor.role === 'GENERAL_MANAGER' ? form.locationId : undefined,
      lines,
    };
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    const body = payload();
    if (!form || !body) return;
    setSaving(true);
    try {
      const saved = doc ? await updateSalesInvoice(doc.id, body) : await createSalesInvoice(body);
      setDoc(saved);
      push('حُفظت المسودة.', 'ok');
      await reload();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function postDoc() {
    const body = payload();
    if (!form || !body) return;
    setSaving(true);
    try {
      const saved = doc ? await updateSalesInvoice(doc.id, body) : await createSalesInvoice(body);
      setDoc(saved);
      const posted = await postSalesInvoice(saved.id);
      setDoc(posted);
      push('رُحّلت الفاتورة ونُقص المخزون.', 'ok');
      await reload();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (!doc) {
      setForm(null);
      return;
    }
    setSaving(true);
    try {
      await deleteSalesInvoice(doc.id);
      setDoc(null);
      setForm(null);
      push('حُذفت المسودة.', 'ok');
      await reload();
    } catch (error) {
      push(masterErrorMessage(error), 'err');
    } finally {
      setSaving(false);
    }
  }

  const subtotal = form?.lines.reduce((sum, line) => sum + lineAmount(line), 0) ?? 0;
  const headerDiscount = Number(form?.discount || 0);
  const total = Math.max(0, subtotal - (Number.isFinite(headerDiscount) ? headerDiscount : 0));
  const locked = doc?.status === 'POSTED' || doc?.status === 'VOID';
  const productOptions = products.map((product) => ({
    value: product.id,
    label: product.barcode ? `${product.name} · ${product.sku} · ${product.barcode}` : `${product.name} · ${product.sku}`,
  }));

  function scanLine(code: string) {
    if (!form) return;
    const product = findScannedProduct(products, code);
    if (!product) {
      push('لا يوجد صنف بهذا الباركود.', 'err');
      return;
    }
    setForm({
      ...form,
      lines: addScannedLine(form.lines, product.id, product.salePrice || '', blankLine()),
    });
  }

  function pickProduct(product: ProductRow) {
    if (!form) return;
    setForm({
      ...form,
      lines: addScannedLine(form.lines, product.id, product.salePrice || '', blankLine()),
    });
  }

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (tab !== 'customers' || !needle) return customers;
    return customers.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(needle));
  }, [customers, query, tab]);

  return (
    <div className="ops-page sl">
      {toasts}
      <OpsCard
        title="فواتير البيع"
        chip="المبيعات"
        toolbar={
        <div className="sl-head-tools">
          {canWrite && tab === 'invoices' ? (
            <OpsButton variant="primary" type="button" onClick={openNew}>
              فاتورة جديدة
            </OpsButton>
          ) : null}
          {canManage && tab === 'customers' ? (
            <OpsButton variant="primary" type="button" onClick={() => setCustomerForm('new')}>
              زبون جديد
            </OpsButton>
          ) : null}
        </div>
        }
      >
      <p className="sl-lead">مسودة ثم ترحيل يُخرج البضاعة. القبض يُسجَّل وارداً مستقلاً ولا يُعدَّل من شاشة الوارد.</p>

      <div className="sl-tabs">
        <OpsButton variant="choice" className={tab === 'invoices' ? 'is-on' : ''} type="button" onClick={() => setTab('invoices')}>
          الفواتير
        </OpsButton>
        <OpsButton variant="choice" className={tab === 'customers' ? 'is-on' : ''} type="button" onClick={() => setTab('customers')}>
          الزبائن
        </OpsButton>
      </div>

      <div className="sl-tools">
        <OpsInput
          value={query}
          placeholder={tab === 'invoices' ? 'بحث بالرقم أو الزبون' : 'بحث بالاسم أو الهاتف'}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && tab === 'invoices') {
              reload().catch((error) => push(masterErrorMessage(error), 'err'));
            }
          }}
        />
        {tab === 'invoices' ? (
          <div className="sl-filters">
            {(['ALL', 'DRAFT', 'POSTED', 'VOID'] as const).map((item) => (
              <OpsButton variant="choice" className={status === item ? 'is-on' : ''}
                key={item}
                type="button"
                onClick={() => setStatus(item)}
              >
                {item === 'ALL' ? 'الكل' : STATUS_LABEL[item]}
              </OpsButton>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'invoices' ? (
        <OpsTable>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>الزبون</th>
                <th>المستودع</th>
                <th>الإجمالي</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th>الموظف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} onClick={() => openExisting(row.id).catch((error) => push(masterErrorMessage(error), 'err'))}>
                  <td>{row.number}</td>
                  <td>{row.transactionDate}</td>
                  <td>{row.customerName}</td>
                  <td>{row.warehouseName}</td>
                  <td>
                    {money(row.total)} {row.currency}
                  </td>
                  <td>{money(row.balance)}</td>
                  <td>
                    <span className={`sl-badge is-${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status]}</span>
                    {row.status === 'POSTED' ? (
                      <span className="sl-pay">{PAY_LABEL[row.paymentState]}</span>
                    ) : null}
                  </td>
                  <td>{row.employeeName}</td>
                </tr>
              ))}
              {ready && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="sl-empty">
                    لا فواتير في هذا العرض.
                  </td>
                </tr>
              ) : null}
            </tbody>
        </OpsTable>
      ) : (
        <OpsTable>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>العنوان</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((row) => (
                <tr key={row.id} onClick={() => canManage && setCustomerForm(row)}>
                  <td>{row.name}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{row.address || '—'}</td>
                  <td>{statusLabel(row.status)}</td>
                </tr>
              ))}
              {ready && visibleCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="sl-empty">
                    لا زبائن بعد.
                  </td>
                </tr>
              ) : null}
            </tbody>
        </OpsTable>
      )}
      </OpsCard>

      {form && doc?.status !== 'VOID' ? (
        <OpsDialog
          wide
          className={locked ? undefined : 'is-trade'}
          title={doc ? doc.number : 'فاتورة جديدة'}
          onClose={() => {
            setForm(null);
            setDoc(null);
            setPayOpen(false);
          }}
          footer={
            locked ? (
              <div className="sl-footer">
                <OpsButton variant="secondary" type="button" onClick={() => window.print()}>
                  طباعة
                </OpsButton>
                {doc?.status === 'POSTED' && canWrite && doc.paymentState !== 'PAID' ? (
                  <OpsButton variant="primary" type="button" onClick={() => setPayOpen(true)}>
                    تسجيل قبض
                  </OpsButton>
                ) : null}
                {doc?.status === 'POSTED' && canManage ? (
                  <OpsButton variant="danger" type="button" onClick={() => { setReason(''); setReasonOpen({ kind: 'void' }); }}>
                    إلغاء الفاتورة
                  </OpsButton>
                ) : null}
              </div>
            ) : (
              <OpsDialogFooter
                onCancel={() => {
                  setForm(null);
                  setDoc(null);
                }}
                formId="sales-doc"
                saveLabel="حفظ مسودة"
                saving={saving}
              />
            )
          }
        >
          <div className={locked ? undefined : 'trade-doc'}>
          <form id="sales-doc" className="sl-doc sales-print" onSubmit={saveDraft}>
            <div className="sl-print-head">
              <strong>TRADIVIA</strong>
              <span>{doc?.number || 'مسودة'}</span>
            </div>
            <div className="sl-grid">
              <OpsField label="التاريخ"><OpsInput
                  type="date"
                  required
                  disabled={locked}
                  value={form.transactionDate}
                  onChange={(event) => setForm({ ...form, transactionDate: event.target.value })}
                />
              </OpsField>
              <OpsField label="الزبون"><OpsSelect
                  value={form.customerId}
                  disabled={locked}
                  placeholder="اختر الزبون"
                  options={customers.filter((row) => row.status === 'ACTIVE' || row.id === form.customerId).map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  onChange={(customerId) => setForm({ ...form, customerId })}
                />
              </OpsField>
              <OpsField label="المستودع"><OpsSelect
                  value={form.warehouseId}
                  disabled={locked}
                  placeholder="المستودع"
                  options={warehouses.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(warehouseId) => setForm({ ...form, warehouseId })}
                />
              </OpsField>
              <OpsField label="العملة"><OpsSelect
                  value={form.currency}
                  disabled={locked}
                  options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(currency) => setForm({ ...form, currency: currency as CurrencyCode })}
                />
              </OpsField>
              {form.currency === 'SYP' ? (
                <OpsField label="سعر الصرف">
                  <OpsInput inputMode="decimal" value={form.fxRate} placeholder="ل.س / دولار" disabled={locked} onChange={(event) => setForm({ ...form, fxRate: event.target.value })} />
                </OpsField>
              ) : null}
              {actor.role === 'GENERAL_MANAGER' ? (
                <OpsField label="المكتب"><OpsSelect
                    value={form.locationId}
                    disabled={locked}
                    placeholder="المكتب"
                    options={locations.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                    onChange={(locationId) => setForm({ ...form, locationId })}
                  />
                </OpsField>
              ) : null}
            </div>

            {!locked ? <BarcodeScan onScan={scanLine} /> : null}
            <OpsTable dense>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>حسم البند</th>
                  <th>الإجمالي</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const product = products.find((item) => item.id === line.productId);
                  return (
                    <tr key={line.key}>
                      <td>
                        {locked ? (
                          doc?.lines[index]?.productName
                        ) : (
                          <OpsSelect
                            value={line.productId}
                            placeholder="الصنف"
                            options={productOptions}
                            onChange={(productId) => {
                              const picked = products.find((item) => item.id === productId);
                              const lines = form.lines.slice();
                              lines[index] = {
                                ...line,
                                productId,
                                unitPrice: picked?.salePrice || line.unitPrice,
                              };
                              setForm({ ...form, lines });
                            }}
                          />
                        )}
                        {product ? <small>{UNITS[product.unit] || product.unit} · رصيد {product.onHand}</small> : null}
                      </td>
                      <td>
                        <OpsInput
                          inputMode="decimal"
                          disabled={locked}
                          value={line.quantity}
                          onChange={(event) => {
                            const lines = form.lines.slice();
                            lines[index] = { ...line, quantity: event.target.value };
                            setForm({ ...form, lines });
                          }}
                        />
                      </td>
                      <td>
                        <OpsInput
                          inputMode="decimal"
                          disabled={locked}
                          value={line.unitPrice}
                          onChange={(event) => {
                            const lines = form.lines.slice();
                            lines[index] = { ...line, unitPrice: event.target.value };
                            setForm({ ...form, lines });
                          }}
                        />
                      </td>
                      <td>
                        <OpsInput
                          inputMode="decimal"
                          disabled={locked}
                          value={line.discount}
                          onChange={(event) => {
                            const lines = form.lines.slice();
                            lines[index] = { ...line, discount: event.target.value };
                            setForm({ ...form, lines });
                          }}
                        />
                      </td>
                      <td>{money(lineAmount(line))}</td>
                      <td>
                        {!locked ? (
                          <OpsButton variant="secondary"
                            type="button"
                            onClick={() => setForm({ ...form, lines: form.lines.filter((item) => item.key !== line.key) })}
                          >
                            حذف
                          </OpsButton>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </OpsTable>
            {!locked ? (
              <OpsButton variant="secondary" type="button" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}>
                بند جديد
              </OpsButton>
            ) : null}

            <div className="sl-totals">
              <OpsField label="حسم الفاتورة"><OpsInput
                  inputMode="decimal"
                  disabled={locked}
                  value={form.discount}
                  onChange={(event) => setForm({ ...form, discount: event.target.value })}
                />
              </OpsField>
              <div>
                <span>المجموع</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div>
                <span>الصافي</span>
                <strong>{money(locked && doc ? doc.total : total)}</strong>
              </div>
              {doc?.status === 'POSTED' ? (
                <div>
                  <span>المتبقي</span>
                  <strong>{money(doc.balance)}</strong>
                </div>
              ) : null}
            </div>

            <OpsField className="sl-notes" label="ملاحظات"><OpsTextarea
                disabled={locked}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </OpsField>

            {!locked && doc ? (
              <div className="sl-extra">
                <OpsButton variant="primary" type="button" disabled={saving} onClick={postDoc}>
                  ترحيل وإخراج من المستودع
                </OpsButton>
                <OpsButton variant="danger" type="button" disabled={saving} onClick={discard}>
                  حذف المسودة
                </OpsButton>
              </div>
            ) : null}
            {!locked && !doc ? (
              <div className="sl-extra">
                <OpsButton variant="primary" type="button" disabled={saving} onClick={postDoc}>
                  حفظ وترحيل
                </OpsButton>
              </div>
            ) : null}

            {doc?.status === 'POSTED' ? (
              <section className="sl-payments">
                <h3>القبض</h3>
                {doc.payments.length === 0 ? <p>لا قبض بعد. المتبقي كامل على الفاتورة.</p> : null}
                {doc.payments.map((payment) => (
                  <div key={payment.id} className={payment.status === 'REVERSED' ? 'is-reversed' : ''}>
                    <span>
                      {payment.transactionDate} · {money(payment.amount)} · {payment.incomeReference}
                    </span>
                    <span>{payment.status === 'POSTED' ? 'قائم' : 'ملغى'}</span>
                    {payment.status === 'POSTED' && canManage ? (
                      <OpsButton variant="secondary"
                        type="button"
                        onClick={() => {
                          setReason('');
                          setReasonOpen({ kind: 'reverse', paymentId: payment.id });
                        }}
                      >
                        عكس القبض
                      </OpsButton>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
            {doc?.status === 'VOID' ? <p className="sl-void">أُلغيت: {doc.voidReason}</p> : null}
          </form>
          {!locked ? <ProductPicker products={products} price="sale" onPick={pickProduct} /> : null}
          </div>
        </OpsDialog>
      ) : null}

      {doc?.status === 'VOID' && form ? (
        <OpsDialog title={doc.number} onClose={() => { setForm(null); setDoc(null); }}>
          <div className="sales-print">
            <p>فاتورة ملغاة. السبب: {doc.voidReason}</p>
            <p>
              {doc.customerName} · {money(doc.total)} {doc.currency}
            </p>
          </div>
        </OpsDialog>
      ) : null}

      {payOpen && doc ? (
        <PayDialog
          invoice={doc}
          projects={incomeProjects}
          banks={banks}
          onClose={() => setPayOpen(false)}
          onDone={async (saved) => {
            setDoc(saved);
            setPayOpen(false);
            push('سُجّل القبض في الوارد.', 'ok');
            onChanged?.();
            await reload();
          }}
        />
      ) : null}

      {reasonOpen ? (
        <OpsDialog title={reasonOpen.kind === 'void' ? 'إلغاء الفاتورة' : 'عكس القبض'} onClose={() => setReasonOpen(null)}>
          <form
            id="sales-reason"
            className="sl-reason"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!doc) return;
              setSaving(true);
              try {
                const saved =
                  reasonOpen.kind === 'void'
                    ? await voidSalesInvoice(doc.id, reason)
                    : await reverseSalesPayment(doc.id, reasonOpen.paymentId, reason);
                setDoc(saved);
                setReasonOpen(null);
                push(reasonOpen.kind === 'void' ? 'أُلغيت الفاتورة وأُعيد المخزون.' : 'عُكس القبض.', 'ok');
                onChanged?.();
                await reload();
              } catch (error) {
                push(masterErrorMessage(error), 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            <OpsField label="السبب"><OpsTextarea required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </OpsField>
            <OpsDialogFooter formId="sales-reason" onCancel={() => setReasonOpen(null)} saveLabel="تأكيد" saving={saving} />
          </form>
        </OpsDialog>
      ) : null}

      {customerForm ? (
        <CustomerDialog
          initial={customerForm === 'new' ? null : customerForm}
          onClose={() => setCustomerForm(null)}
          onDone={async (message) => {
            setCustomerForm(null);
            push(message, 'ok');
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PayDialog({
  invoice,
  projects,
  banks,
  onClose,
  onDone,
}: {
  invoice: SalesInvoiceDetail;
  projects: ProjectRow[];
  banks: NamedRecord[];
  onClose: () => void;
  onDone: (row: SalesInvoiceDetail) => Promise<void>;
}) {
  const { push, node: toasts } = useOpsToasts();
  const [saving, setSaving] = useState(false);
  const [fund, setFund] = useState<OperationFund>('VAULT');
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [amount, setAmount] = useState(invoice.balance);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  return (
    <OpsDialog title={`قبض ${invoice.number}`} onClose={onClose}>
      {toasts}
      <form
        id="sales-pay"
        className="sl-reason"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const saved = await paySalesInvoice(invoice.id, {
              transactionDate: date,
              amount: Number(amount),
              projectId,
              fund,
              bankId: fund === 'BANK' ? bankId : undefined,
              notes,
            });
            await onDone(saved);
          } catch (error) {
            push(masterErrorMessage(error), 'err');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p>المتبقي {money(invoice.balance)} {invoice.currency}. يُنشأ وارد مكتمل بهذا المبلغ.</p>
        <OpsField label="التاريخ"><OpsInput type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </OpsField>
        <OpsField label="المبلغ"><OpsInput required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </OpsField>
        <OpsField label="المشروع"><OpsSelect
            value={projectId}
            placeholder="مشروع الوارد"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={setProjectId}
          />
        </OpsField>
        <OpsField label="الصندوق"><OpsSelect
            value={fund}
            options={INCOME_FUNDS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setFund(value as OperationFund)}
          />
        </OpsField>
        {fund === 'BANK' ? (
          <OpsField label="البنك"><OpsSelect
              value={bankId}
              placeholder="البنك"
              options={banks.filter((bank) => bank.status === 'ACTIVE').map((bank) => ({ value: bank.id, label: bank.name }))}
              onChange={setBankId}
            />
          </OpsField>
        ) : null}
        <OpsField label="ملاحظة"><OpsTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </OpsField>
        <OpsDialogFooter formId="sales-pay" onCancel={onClose} saveLabel="تسجيل القبض" saving={saving} />
      </form>
    </OpsDialog>
  );
}

function CustomerDialog({
  initial,
  onClose,
  onDone,
}: {
  initial: CustomerRow | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { push, node: toasts } = useOpsToasts();
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [status, setStatus] = useState<RecordStatus>(initial?.status || 'ACTIVE');
  const [saving, setSaving] = useState(false);

  return (
    <OpsDialog title={initial ? 'تعديل زبون' : 'زبون جديد'} onClose={onClose}>
      {toasts}
      <form
        id="sales-customer"
        className="sl-reason"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const body = { name, phone, address, notes, status };
            if (initial) await updateCustomer(initial.id, body);
            else await createCustomer(body);
            await onDone(initial ? 'تم تعديل الزبون.' : 'أُضيف الزبون.');
          } catch (error) {
            push(masterErrorMessage(error), 'err');
          } finally {
            setSaving(false);
          }
        }}
      >
        <OpsField label="الاسم"><OpsInput required value={name} onChange={(event) => setName(event.target.value)} />
        </OpsField>
        <OpsField label="الهاتف"><OpsInput value={phone} onChange={(event) => setPhone(event.target.value)} />
        </OpsField>
        <OpsField label="العنوان"><OpsInput value={address} onChange={(event) => setAddress(event.target.value)} />
        </OpsField>
        <OpsField label="ملاحظات"><OpsTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </OpsField>
        <OpsField label="الحالة"><OpsSelect
            value={status}
            options={[
              { value: 'ACTIVE', label: 'نشط' },
              { value: 'INACTIVE', label: 'موقوف' },
            ]}
            onChange={(value) => setStatus(value as RecordStatus)}
          />
        </OpsField>
        <OpsDialogFooter formId="sales-customer" onCancel={onClose} saveLabel="حفظ" saving={saving} />
        {initial ? (
          <OpsButton variant="danger"
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                const result = await deleteCustomer(initial.id);
                await onDone(result.deactivated ? 'الزبون مرتبط بفواتير فأُوقف.' : 'حُذف الزبون.');
              } catch (error) {
                push(masterErrorMessage(error), 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            حذف أو إيقاف
          </OpsButton>
        ) : null}
      </form>
    </OpsDialog>
  );
}
