'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  INCOME_FUNDS,
  SupplierRow,
  LocationRow,
  NamedRecord,
  OperationFund,
  ProductRow,
  ProjectRow,
  RecordStatus,
  PurchaseInvoiceDetail,
  PurchaseInvoiceInput,
  PurchaseInvoiceStatus,
  PurchaseInvoiceSummary,
  createPurchaseInvoice,
  createSupplier,
  deletePurchaseInvoice,
  deleteSupplier,
  getProductCatalog,
  getPurchaseInvoice,
  listPurchaseInvoices,
  listSuppliers,
  listWarehouses,
  payPurchaseInvoice,
  postPurchaseInvoice,
  reversePurchasePayment,
  updatePurchaseInvoice,
  updateSupplier,
  voidPurchaseInvoice,
  WarehouseRow,
} from '../lib/api';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { addScannedLine, findScannedProduct } from '../lib/barcode';
import { BarcodeScan } from './barcode-scan';
import { ProductPicker } from './product-picker';
import { OpsSelect } from './ops-select';
import { OpsInput } from './ops-field';
import { useOpsToasts } from './ops-toasts';

const UNITS: Record<string, string> = {
  PIECE: 'قطعة',
  KG: 'كغ',
  METER: 'متر',
  LITER: 'لتر',
  BOX: 'صندوق',
  SET: 'طقم',
};

const STATUS_LABEL: Record<PurchaseInvoiceStatus, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحّلة',
  VOID: 'ملغاة',
};

const PAY_LABEL = { UNPAID: 'غير مدفوعة', PARTIAL: 'دفع جزئي', PAID: 'مدفوعة' };

type LineDraft = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
};

type DocForm = {
  transactionDate: string;
  supplierId: string;
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

export function PurchasePanel({
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
  const [tab, setTab] = useState<'invoices' | 'suppliers'>('invoices');
  const [rows, setRows] = useState<PurchaseInvoiceSummary[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<PurchaseInvoiceStatus | 'ALL'>('ALL');
  const [ready, setReady] = useState(false);
  const [doc, setDoc] = useState<PurchaseInvoiceDetail | null>(null);
  const [form, setForm] = useState<DocForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierRow | 'new' | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState<null | { kind: 'void' } | { kind: 'reverse'; paymentId: string }>(null);
  const [reason, setReason] = useState('');

  async function reload() {
    const [invoices, people, sites] = await Promise.all([
      listPurchaseInvoices({
        status: status === 'ALL' ? undefined : status,
        q: query.trim() || undefined,
      }),
      listSuppliers(),
      listWarehouses(),
    ]);
    setRows(invoices);
    setSuppliers(people);
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

  const outcomeProjects = projects.filter((project) => project.status === 'ACTIVE' && project.showIn.includes('OUTCOME'));

  function openNew() {
    const warehouseId = warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id || '';
    setDoc(null);
    setForm({
      transactionDate: today(),
      supplierId: '',
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
    const detail = await getPurchaseInvoice(id);
    setDoc(detail);
    setForm({
      transactionDate: detail.transactionDate,
      supplierId: detail.supplierId,
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

  function payload(): PurchaseInvoiceInput | null {
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
      supplierId: form.supplierId,
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
      const saved = doc ? await updatePurchaseInvoice(doc.id, body) : await createPurchaseInvoice(body);
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
      const saved = doc ? await updatePurchaseInvoice(doc.id, body) : await createPurchaseInvoice(body);
      setDoc(saved);
      const posted = await postPurchaseInvoice(saved.id);
      setDoc(posted);
      push('رُحّلت الفاتورة ودخل المخزون.', 'ok');
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
      await deletePurchaseInvoice(doc.id);
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
      lines: addScannedLine(form.lines, product.id, product.costPrice || '', blankLine()),
    });
  }

  function pickProduct(product: ProductRow) {
    if (!form) return;
    setForm({
      ...form,
      lines: addScannedLine(form.lines, product.id, product.costPrice || '', blankLine()),
    });
  }

  const visibleSuppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (tab !== 'suppliers' || !needle) return suppliers;
    return suppliers.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(needle));
  }, [suppliers, query, tab]);

  return (
    <div className="ops-page sl">
      {toasts}
      <OpsCard
        title="فواتير الشراء"
        chip="المشتريات"
        toolbar={
        <div className="sl-head-tools">
          {canWrite && tab === 'invoices' ? (
            <button type="button" className="sl-primary" onClick={openNew}>
              فاتورة جديدة
            </button>
          ) : null}
          {canManage && tab === 'suppliers' ? (
            <button type="button" className="sl-primary" onClick={() => setSupplierForm('new')}>
              مورد جديد
            </button>
          ) : null}
        </div>
        }
      >
      <p className="sl-lead">مسودة ثم ترحيل يُدخل البضاعة ويحدّث متوسط التكلفة. الدفع يُسجَّل صادراً مستقلاً ولا يُعدَّل من شاشة الصادر.</p>

      <div className="sl-tabs">
        <button type="button" className={tab === 'invoices' ? 'is-on' : ''} onClick={() => setTab('invoices')}>
          الفواتير
        </button>
        <button type="button" className={tab === 'suppliers' ? 'is-on' : ''} onClick={() => setTab('suppliers')}>
          الموردون
        </button>
      </div>

      <div className="sl-tools">
        <input
          value={query}
          placeholder={tab === 'invoices' ? 'بحث بالرقم أو المورد' : 'بحث بالاسم أو الهاتف'}
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
              <button
                key={item}
                type="button"
                className={status === item ? 'is-on' : ''}
                onClick={() => setStatus(item)}
              >
                {item === 'ALL' ? 'الكل' : STATUS_LABEL[item]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'invoices' ? (
        <div className="sl-table-wrap">
          <table className="sl-table">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>المورد</th>
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
                  <td>{row.supplierName}</td>
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
          </table>
        </div>
      ) : (
        <div className="sl-table-wrap">
          <table className="sl-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>العنوان</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {visibleSuppliers.map((row) => (
                <tr key={row.id} onClick={() => canManage && setSupplierForm(row)}>
                  <td>{row.name}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{row.address || '—'}</td>
                  <td>{statusLabel(row.status)}</td>
                </tr>
              ))}
              {ready && visibleSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="sl-empty">
                    لا موردين بعد.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
                <button type="button" onClick={() => window.print()}>
                  طباعة
                </button>
                {doc?.status === 'POSTED' && canWrite && doc.paymentState !== 'PAID' ? (
                  <button type="button" className="sl-primary" onClick={() => setPayOpen(true)}>
                    تسجيل دفع
                  </button>
                ) : null}
                {doc?.status === 'POSTED' && canManage ? (
                  <button type="button" className="sl-danger" onClick={() => { setReason(''); setReasonOpen({ kind: 'void' }); }}>
                    إلغاء الفاتورة
                  </button>
                ) : null}
              </div>
            ) : (
              <OpsDialogFooter
                onCancel={() => {
                  setForm(null);
                  setDoc(null);
                }}
                formId="purchase-doc"
                saveLabel="حفظ مسودة"
                saving={saving}
              />
            )
          }
        >
          <div className={locked ? undefined : 'trade-doc'}>
          <form id="purchase-doc" className="sl-doc sales-print" onSubmit={saveDraft}>
            <div className="sl-print-head">
              <strong>TRADIVIA</strong>
              <span>{doc?.number || 'مسودة'}</span>
            </div>
            <div className="sl-grid">
              <label>
                التاريخ
                <input
                  type="date"
                  required
                  disabled={locked}
                  value={form.transactionDate}
                  onChange={(event) => setForm({ ...form, transactionDate: event.target.value })}
                />
              </label>
              <label>
                المورد
                <OpsSelect
                  value={form.supplierId}
                  disabled={locked}
                  placeholder="اختر المورد"
                  options={suppliers.filter((row) => row.status === 'ACTIVE' || row.id === form.supplierId).map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  onChange={(supplierId) => setForm({ ...form, supplierId })}
                />
              </label>
              <label>
                المستودع
                <OpsSelect
                  value={form.warehouseId}
                  disabled={locked}
                  placeholder="المستودع"
                  options={warehouses.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(warehouseId) => setForm({ ...form, warehouseId })}
                />
              </label>
              <label>
                العملة
                <OpsSelect
                  value={form.currency}
                  disabled={locked}
                  options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(currency) => setForm({ ...form, currency: currency as CurrencyCode })}
                />
              </label>
              {form.currency === 'SYP' ? (
                <label>
                  سعر الصرف
                  <OpsInput inputMode="decimal" value={form.fxRate} placeholder="ل.س / دولار" disabled={locked} onChange={(event) => setForm({ ...form, fxRate: event.target.value })} />
                </label>
              ) : null}
              {actor.role === 'GENERAL_MANAGER' ? (
                <label>
                  المكتب
                  <OpsSelect
                    value={form.locationId}
                    disabled={locked}
                    placeholder="المكتب"
                    options={locations.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                    onChange={(locationId) => setForm({ ...form, locationId })}
                  />
                </label>
              ) : null}
            </div>

            {!locked ? <BarcodeScan onScan={scanLine} /> : null}
            <table className="sl-lines">
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
                                unitPrice: picked?.costPrice || line.unitPrice,
                              };
                              setForm({ ...form, lines });
                            }}
                          />
                        )}
                        {product ? <small>{UNITS[product.unit] || product.unit} · رصيد {product.onHand}</small> : null}
                      </td>
                      <td>
                        <input
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
                        <input
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
                        <input
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
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, lines: form.lines.filter((item) => item.key !== line.key) })}
                          >
                            حذف
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!locked ? (
              <button type="button" className="sl-add" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}>
                بند جديد
              </button>
            ) : null}

            <div className="sl-totals">
              <label>
                حسم الفاتورة
                <input
                  inputMode="decimal"
                  disabled={locked}
                  value={form.discount}
                  onChange={(event) => setForm({ ...form, discount: event.target.value })}
                />
              </label>
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

            <label className="sl-notes">
              ملاحظات
              <textarea
                disabled={locked}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>

            {!locked && doc ? (
              <div className="sl-extra">
                <button type="button" className="sl-primary" disabled={saving} onClick={postDoc}>
                  ترحيل وإدخال للمستودع
                </button>
                <button type="button" className="sl-danger" disabled={saving} onClick={discard}>
                  حذف المسودة
                </button>
              </div>
            ) : null}
            {!locked && !doc ? (
              <div className="sl-extra">
                <button type="button" className="sl-primary" disabled={saving} onClick={postDoc}>
                  حفظ وترحيل
                </button>
              </div>
            ) : null}

            {doc?.status === 'POSTED' ? (
              <section className="sl-payments">
                <h3>الدفع</h3>
                {doc.payments.length === 0 ? <p>لا دفع بعد. المتبقي كامل على الفاتورة.</p> : null}
                {doc.payments.map((payment) => (
                  <div key={payment.id} className={payment.status === 'REVERSED' ? 'is-reversed' : ''}>
                    <span>
                      {payment.transactionDate} · {money(payment.amount)} · {payment.outcomeReference}
                    </span>
                    <span>{payment.status === 'POSTED' ? 'قائم' : 'ملغى'}</span>
                    {payment.status === 'POSTED' && canManage ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReason('');
                          setReasonOpen({ kind: 'reverse', paymentId: payment.id });
                        }}
                      >
                        عكس الدفع
                      </button>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
            {doc?.status === 'VOID' ? <p className="sl-void">أُلغيت: {doc.voidReason}</p> : null}
          </form>
          {!locked ? <ProductPicker products={products} price="cost" onPick={pickProduct} /> : null}
          </div>
        </OpsDialog>
      ) : null}

      {doc?.status === 'VOID' && form ? (
        <OpsDialog title={doc.number} onClose={() => { setForm(null); setDoc(null); }}>
          <div className="sales-print">
            <p>فاتورة ملغاة. السبب: {doc.voidReason}</p>
            <p>
              {doc.supplierName} · {money(doc.total)} {doc.currency}
            </p>
          </div>
        </OpsDialog>
      ) : null}

      {payOpen && doc ? (
        <PayDialog
          invoice={doc}
          projects={outcomeProjects}
          banks={banks}
          onClose={() => setPayOpen(false)}
          onDone={async (saved) => {
            setDoc(saved);
            setPayOpen(false);
            push('سُجّل الدفع في الصادر.', 'ok');
            onChanged?.();
            await reload();
          }}
        />
      ) : null}

      {reasonOpen ? (
        <OpsDialog title={reasonOpen.kind === 'void' ? 'إلغاء الفاتورة' : 'عكس الدفع'} onClose={() => setReasonOpen(null)}>
          <form
            id="purchase-reason"
            className="sl-reason"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!doc) return;
              setSaving(true);
              try {
                const saved =
                  reasonOpen.kind === 'void'
                    ? await voidPurchaseInvoice(doc.id, reason)
                    : await reversePurchasePayment(doc.id, reasonOpen.paymentId, reason);
                setDoc(saved);
                setReasonOpen(null);
                push(reasonOpen.kind === 'void' ? 'أُلغيت الفاتورة وأُخرج المخزون.' : 'عُكس الدفع.', 'ok');
                onChanged?.();
                await reload();
              } catch (error) {
                push(masterErrorMessage(error), 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              السبب
              <textarea required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <OpsDialogFooter formId="purchase-reason" onCancel={() => setReasonOpen(null)} saveLabel="تأكيد" saving={saving} />
          </form>
        </OpsDialog>
      ) : null}

      {supplierForm ? (
        <SupplierDialog
          initial={supplierForm === 'new' ? null : supplierForm}
          onClose={() => setSupplierForm(null)}
          onDone={async (message) => {
            setSupplierForm(null);
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
  invoice: PurchaseInvoiceDetail;
  projects: ProjectRow[];
  banks: NamedRecord[];
  onClose: () => void;
  onDone: (row: PurchaseInvoiceDetail) => Promise<void>;
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
    <OpsDialog title={`دفع ${invoice.number}`} onClose={onClose}>
      {toasts}
      <form
        id="purchase-pay"
        className="sl-reason"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const saved = await payPurchaseInvoice(invoice.id, {
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
        <p>المتبقي {money(invoice.balance)} {invoice.currency}. يُنشأ صادر مكتمل بهذا المبلغ.</p>
        <label>
          التاريخ
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          المبلغ
          <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label>
          المشروع
          <OpsSelect
            value={projectId}
            placeholder="مشروع الصادر"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={setProjectId}
          />
        </label>
        <label>
          الصندوق
          <OpsSelect
            value={fund}
            options={INCOME_FUNDS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setFund(value as OperationFund)}
          />
        </label>
        {fund === 'BANK' ? (
          <label>
            البنك
            <OpsSelect
              value={bankId}
              placeholder="البنك"
              options={banks.filter((bank) => bank.status === 'ACTIVE').map((bank) => ({ value: bank.id, label: bank.name }))}
              onChange={setBankId}
            />
          </label>
        ) : null}
        <label>
          ملاحظة
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <OpsDialogFooter formId="purchase-pay" onCancel={onClose} saveLabel="تسجيل الدفع" saving={saving} />
      </form>
    </OpsDialog>
  );
}

function SupplierDialog({
  initial,
  onClose,
  onDone,
}: {
  initial: SupplierRow | null;
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
    <OpsDialog title={initial ? 'تعديل مورد' : 'مورد جديد'} onClose={onClose}>
      {toasts}
      <form
        id="purchase-supplier"
        className="sl-reason"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const body = { name, phone, address, notes, status };
            if (initial) await updateSupplier(initial.id, body);
            else await createSupplier(body);
            await onDone(initial ? 'تم تعديل المورد.' : 'أُضيف المورد.');
          } catch (error) {
            push(masterErrorMessage(error), 'err');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          الاسم
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          الهاتف
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          العنوان
          <input value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label>
          ملاحظات
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label>
          الحالة
          <OpsSelect
            value={status}
            options={[
              { value: 'ACTIVE', label: 'نشط' },
              { value: 'INACTIVE', label: 'موقوف' },
            ]}
            onChange={(value) => setStatus(value as RecordStatus)}
          />
        </label>
        <OpsDialogFooter formId="purchase-supplier" onCancel={onClose} saveLabel="حفظ" saving={saving} />
        {initial ? (
          <button
            type="button"
            className="sl-danger"
            onClick={async () => {
              setSaving(true);
              try {
                const result = await deleteSupplier(initial.id);
                await onDone(result.deactivated ? 'المورد مرتبط بفواتير فأُوقف.' : 'حُذف المورد.');
              } catch (error) {
                push(masterErrorMessage(error), 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            حذف أو إيقاف
          </button>
        ) : null}
      </form>
    </OpsDialog>
  );
}
