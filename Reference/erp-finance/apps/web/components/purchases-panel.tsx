'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  INCOME_FUNDS,
  SupplierRow,
  LocationRow,
  NamedRecord,
  OpenItemRow,
  OperationFund,
  ProductRow,
  ProjectRow,
  RecordStatus,
  PurchaseInvoiceDetail,
  PurchaseInvoiceInput,
  PurchaseInvoiceStatus,
  PurchaseInvoiceSummary,
  createPurchaseInvoice,
  createProduct,
  createSupplier,
  deletePurchaseInvoice,
  deleteSupplier,
  getProductCatalog,
  getPurchaseInvoice,
  listPurchaseInvoices,
  listOpenItems,
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
import { confirmAction } from '../lib/dialogs';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { DocumentStepper, invoiceStage } from './ui/document-stepper';
import { Button } from './ui/button';
import { PrintButton } from './print/print-layout';
import { PALETTE_EVENT, dropPaletteOpen, peekPaletteOpen, requestPaletteOpen } from '../lib/palette-open';
import { Modal, ModalFooter } from './ui/modal';
import { addScannedLine, findScannedProduct } from '../lib/barcode';
import { BarcodeScan } from './barcode-scan';
import { Select } from './ui/select';
import { QuickCreateDialog, Combobox } from './ui/combobox';
import { Field, Input, Textarea } from './ui/field';
import { Badge, BadgeTone } from './ui/badge';
import { StatCard, StatGrid } from './ui/stat-card';
import { FilterPills } from './ui/page-toolbar';
import { DocumentPage, ImpactList, JournalImpact, ListPage, SummaryList, SummaryRow } from './ui/templates';
import type { DocAction } from './ui/templates';
import { SlideOver } from './ui/slide-over';
import { useToasts } from './ui/toasts';
import './enterprise.css';

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

function purchaseBadge(row: { status: string; paymentState: string }) {
  if (row.status === 'VOID') return { tone: 'is-void', label: 'ملغاة' };
  if (row.status !== 'POSTED') return { tone: 'is-draft', label: 'مسودة' };
  if (row.paymentState === 'PAID') return { tone: 'is-paid', label: 'مرحّلة مدفوعة' };
  if (row.paymentState === 'PARTIAL') return { tone: 'is-partial', label: 'دفع جزئي' };
  return { tone: 'is-open', label: 'مرحّلة غير مدفوعة' };
}

const BADGE_TONE: Record<string, BadgeTone> = {
  'is-void': 'danger',
  'is-draft': 'neutral',
  'is-paid': 'ok',
  'is-partial': 'warn',
  'is-open': 'info',
};

type PayTarget = { id: string; number: string; balance: string; currency: string };

type LineDraft = {
  key: string;
  productId: string;
  description: string | null;
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
  return {
    key: Math.random().toString(36).slice(2),
    productId: '',
    description: null,
    quantity: '1',
    unitPrice: '',
    discount: '',
  };
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function exportSheet(name: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
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
  screen = 'invoices',
  onChanged,
}: {
  actor: AuthUser;
  locations: LocationRow[];
  projects: ProjectRow[];
  banks: NamedRecord[];
  screen?: 'invoices' | 'suppliers' | 'supplier' | 'new';
  onChanged?: () => void;
}) {
  const { push, node: toasts } = useToasts();
  const canManage = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const canWrite = actor.role !== 'MONITOR';
  const canOpenItems = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR' || actor.role === 'MONITOR';
  const tab = screen === 'suppliers' || screen === 'supplier' ? 'suppliers' : 'invoices';
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
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [reasonOpen, setReasonOpen] = useState<null | { kind: 'void' } | { kind: 'reverse'; paymentId: string }>(null);
  const [reason, setReason] = useState('');
  const [quick, setQuick] = useState<null | { kind: 'supplier'; name: string } | { kind: 'product'; name: string; lineKey: string }>(null);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [journalKey, setJournalKey] = useState(0);
  const [advances, setAdvances] = useState<OpenItemRow[]>([]);
  const [applyAdvanceId, setApplyAdvanceId] = useState('');

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
    listOpenItems()
      .then((items) => setAdvances(items.filter((item) => item.kind === 'ADVANCE_IN' && item.status === 'OPEN')))
      .catch(() => undefined);
  }

  useEffect(() => {
    reload().catch((error) => push(masterErrorMessage(error), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    function onSection(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (id === 'suppliers') setSupplierForm(null);
    }
    window.addEventListener('tradivia-section', onSection);
    return () => window.removeEventListener('tradivia-section', onSection);
  }, []);

  useEffect(() => {
    if (screen === 'supplier' && canManage) setSupplierForm('new');
  }, [screen, canManage]);

  useEffect(() => {
    if (tab !== 'invoices' || !ready) return;
    const handle = setTimeout(() => {
      reload().catch((error) => push(masterErrorMessage(error), 'err'));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!ready || tab !== 'invoices') return;
    const pending = sessionStorage.getItem('unigate.openPurchaseInvoice');
    if (!pending) return;
    sessionStorage.removeItem('unigate.openPurchaseInvoice');
    openExisting(pending).catch((error) => push(masterErrorMessage(error), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

  const linesRef = useRef<HTMLDivElement>(null);

  function closeDoc() {
    setDoc(null);
    setForm(null);
  }

  function addLine() {
    setForm((current) => (current ? { ...current, lines: [...current.lines, blankLine()] } : current));
    requestAnimationFrame(() => {
      const rows = linesRef.current?.querySelectorAll('tbody tr');
      rows?.[rows.length - 1]?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
    });
  }

  /** Enter walks qty → price → discount → next row's item; on the last row it adds a line. */
  function onLinesKey(event: ReactKeyboardEvent) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('is-amount')) return;
    event.preventDefault();
    const row = target.closest('tr');
    if (!row) return;
    const amounts = Array.from(row.querySelectorAll<HTMLInputElement>('input.is-amount'));
    const at = amounts.indexOf(target);
    if (at >= 0 && at < amounts.length - 1) {
      amounts[at + 1].focus();
      amounts[at + 1].select();
      return;
    }
    const next = row.nextElementSibling;
    if (next) next.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
    else addLine();
  }

  const activeWarehouse = form?.warehouseId || warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id;

  useEffect(() => {
    if (!activeWarehouse) return;
    getProductCatalog({ warehouseId: activeWarehouse, filter: 'all' })
      .then((result) => setProducts(result.products.filter((item) => item.status === 'ACTIVE')))
      .catch(() => setProducts([]));
  }, [activeWarehouse]);

  const outcomeProjects = projects.filter((project) => project.status === 'ACTIVE' && project.showIn.includes('OUTCOME'));

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
        description: null,
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
      await openExisting(saved.id);
      push(saved.number ? `حُفظت المسودة ${saved.number}.` : 'حُفظت المسودة.', 'ok');
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
    const ok = await confirmAction({
      title: 'ترحيل الفاتورة',
      message: 'ترحيل فاتورة الشراء يثبت القيد المحاسبي ويدخل المخزون. هل تريد المتابعة؟',
      confirmLabel: 'ترحيل',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const saved = doc ? await updatePurchaseInvoice(doc.id, body) : await createPurchaseInvoice(body);
      setDoc(saved);
      await postPurchaseInvoice(saved.id, applyAdvanceId || undefined);
      await openExisting(saved.id);
      setJournalKey((key) => key + 1);
      push('تم ترحيل الفاتورة بنجاح.', 'ok');
      onChanged?.();
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
    const ok = await confirmAction({
      title: 'حذف المسودة',
      message: `حذف مسودة الفاتورة ${doc.number} نهائي ولا يمكن التراجع عنه.`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
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
    label: product.name,
    keywords: `${product.sku} ${product.barcode || ''} ${product.notes || ''}`,
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

  function openNew(supplierId = '') {
    const warehouseId = warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id || '';
    setDoc(null);
    setSupplierForm(null);
    setForm({
      transactionDate: today(),
      supplierId,
      warehouseId,
      currency: 'USD',
      fxRate: '',
      locationId: actor.locationId || locations[0]?.id || '',
      notes: '',
      discount: '',
      lines: [blankLine()],
    });
  }

  useEffect(() => {
    function consume() {
      const item = peekPaletteOpen();
      if (!item) return;
      if (tab === 'suppliers' && item.kind === 'supplier') {
        if (!ready) return;
        dropPaletteOpen();
        const row = suppliers.find((person) => person.id === item.id);
        if (row) setSupplierForm(row);
        else push('تعذر فتح ملف المورد.', 'err');
        return;
      }
      if (tab !== 'invoices') return;
      if (item.kind === 'purchase') {
        dropPaletteOpen();
        openExisting(item.id).catch((error) => push(masterErrorMessage(error), 'err'));
        return;
      }
      if (item.kind === 'purchase-draft') {
        if (!ready) return;
        dropPaletteOpen();
        openNew(item.supplierId);
      }
    }
    consume();
    window.addEventListener(PALETTE_EVENT, consume);
    return () => window.removeEventListener(PALETTE_EVENT, consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab, suppliers]);

  function openQuickSupplier(name: string) {
    setQuickName(name);
    setQuickPhone('');
    setQuickPrice('');
    setQuickError('');
    setQuick({ kind: 'supplier', name });
  }

  function openQuickProduct(name: string, lineKey: string) {
    setQuickName(name);
    setQuickPhone('');
    setQuickPrice('');
    setQuickError('');
    setQuick({ kind: 'product', name, lineKey });
  }

  async function saveQuick(event: FormEvent) {
    event.preventDefault();
    if (!quick) return;
    setQuickSaving(true);
    setQuickError('');
    try {
      if (quick.kind === 'supplier') {
        const created = await createSupplier({ name: quickName.trim(), phone: quickPhone.trim() || undefined });
        setSuppliers((list) => [created, ...list.filter((row) => row.id !== created.id)]);
        setForm((current) => (current ? { ...current, supplierId: created.id } : current));
      } else {
        const price = quickPrice.trim() ? Number(quickPrice) : undefined;
        const created = await createProduct({ name: quickName.trim(), costPrice: Number.isFinite(price) ? price : undefined });
        setProducts((list) => [created, ...list.filter((row) => row.id !== created.id)]);
        setForm((current) =>
          current
            ? {
                ...current,
                lines: current.lines.map((line) =>
                  line.key === quick.lineKey
                    ? { ...line, productId: created.id, unitPrice: created.costPrice || line.unitPrice, description: null }
                    : line,
                ),
              }
            : current,
        );
      }
      setQuick(null);
    } catch (error) {
      setQuickError(masterErrorMessage(error));
    } finally {
      setQuickSaving(false);
    }
  }

  const visibleSuppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (tab !== 'suppliers' || !needle) return suppliers;
    return suppliers.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(needle));
  }, [suppliers, query, tab]);

  return (
    <div className="ui-page sl">
      {toasts}
      {tab === 'invoices' && !form ? (
        <ListPage
          title="فواتير المشتريات"
          newLabel="+ فاتورة جديدة"
          onNew={canWrite ? () => openNew() : undefined}
          kpis={
            <StatGrid>
              <StatCard label="فواتير ضمن العرض" value={rows.length} />
              <StatCard label="مسودات" value={rows.filter((row) => row.status === 'DRAFT').length} />
              <StatCard label="مرحّلة غير مسدّدة" value={rows.filter((row) => row.status === 'POSTED' && row.paymentState !== 'PAID').length} />
              {openExposure(rows).map(([currency, amount]) => (
                <StatCard key={currency} label={`المستحق للموردين · ${currency}`} value={money(amount)} />
              ))}
            </StatGrid>
          }
          search={query}
          onSearch={setQuery}
          searchPlaceholder="بحث بالرقم أو المورد"
          filters={
            <FilterPills
              value={status}
              onChange={setStatus}
              options={[['ALL', 'الكل'], ['DRAFT', STATUS_LABEL.DRAFT], ['POSTED', STATUS_LABEL.POSTED], ['VOID', STATUS_LABEL.VOID]] as const}
            />
          }
          actions={
            <>
              {canOpenItems ? (
                <Button variant="secondary" onClick={() => { window.location.hash = '#accounting/open-items'; }}>
                  الذمم والتحصيل
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() =>
                  exportSheet(
                    'فواتير-الشراء.csv',
                    ['الرقم', 'التاريخ', 'المورد', 'المستودع', 'الإجمالي', 'المتبقي', 'العملة', 'الحالة', 'الموظف'],
                    rows.map((row) => [
                      row.number,
                      row.transactionDate,
                      row.supplierName,
                      row.warehouseName,
                      row.total,
                      row.balance,
                      row.currency,
                      STATUS_LABEL[row.status],
                      row.employeeName,
                    ]),
                  )
                }
              >
                تصدير
              </Button>
            </>
          }
          columns={[
            { key: 'number', header: 'الرقم', render: (row) => row.number },
            { key: 'date', header: 'التاريخ', render: (row) => row.transactionDate },
            { key: 'supplier', header: 'المورد', render: (row) => row.supplierName },
            { key: 'warehouse', header: 'المستودع', defaultHidden: true, render: (row) => row.warehouseName },
            { key: 'total', header: 'الإجمالي', numeric: true, render: (row) => `${money(row.total)} ${row.currency}` },
            { key: 'balance', header: 'المتبقي', numeric: true, defaultHidden: true, render: (row) => money(row.balance) },
            {
              key: 'status',
              header: 'الحالة',
              render: (row) => {
                const badge = purchaseBadge(row);
                return <Badge tone={BADGE_TONE[badge.tone] || 'neutral'}>{badge.label}</Badge>;
              },
            },
            { key: 'employee', header: 'الموظف', defaultHidden: true, render: (row) => row.employeeName },
            {
              key: 'actions',
              header: '',
              fixed: true,
              render: (row) =>
                canWrite && row.status === 'POSTED' && row.paymentState !== 'PAID' ? (
                  <Button
                    variant="mini"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPayTarget(row);
                    }}
                  >
                    تسجيل دفعة
                  </Button>
                ) : null,
            },
          ]}
          rows={rows}
          tableId="purchase-invoices"
          rowKey={(row) => row.id}
          onOpen={(row) => openExisting(row.id).catch((error) => push(masterErrorMessage(error), 'err'))}
          ready={ready}
          empty="لا فواتير في هذا العرض."
        />
      ) : null}
      {tab === 'suppliers' ? (
        <div className="ent-page">
          <div className="ent-ribbon">
            <Input
              className="ent-search"
              value={query}
              placeholder="بحث بالاسم أو الهاتف"
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="ent-ribbon-end">
              {canManage ? (
                <button type="button" className="ent-primary" onClick={() => setSupplierForm('new')}>
                  + جديد
                </button>
              ) : null}
            </div>
          </div>
          <div className="ent-table-wrap">
            <table className="ent-table is-clickable">
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
                  <tr key={row.id} onClick={() => setSupplierForm(row)}>
                    <td>{row.name}</td>
                    <td>{row.phone || '—'}</td>
                    <td>{row.address || '—'}</td>
                    <td>
                      <span className={`ent-badge ${row.status === 'ACTIVE' ? 'is-paid' : 'is-draft'}`}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                ))}
                {ready && visibleSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="ent-empty">لا موردين بعد.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {form && tab === 'invoices' ? (
        <DocumentPage
          formId="purchase-doc"
          onSubmit={saveDraft}
          canSave={!locked && !saving}
          onPrimary={!locked && !saving ? postDoc : undefined}
          backLabel="الفواتير"
          onBack={closeDoc}
          title={doc ? `فاتورة ${doc.number}` : 'فاتورة مشتريات جديدة'}
          badge={(() => {
            if (!doc) return <Badge>مسودة جديدة</Badge>;
            const badge = purchaseBadge(doc);
            return <Badge tone={BADGE_TONE[badge.tone] || 'neutral'}>{badge.label}</Badge>;
          })()}
          stage={doc ? invoiceStage(doc.status, doc.paymentState) : 'DRAFT'}
          tools={
            doc && locked ? (
              <>
                <PrintButton
                  getDoc={() => ({
                    title: 'فاتورة مشتريات',
                    number: doc.number,
                    date: doc.transactionDate,
                    currency: doc.currency,
                    total: money(doc.total),
                    status: doc.status === 'VOID' ? 'ملغاة' : doc.paymentState === 'PAID' ? 'مغلقة' : 'مرحّلة',
                    partyLabel: 'المورد',
                    partyName: doc.supplierName,
                    officeName: doc.locationName,
                    lines: doc.lines.map((l) => ({ name: l.productName, quantity: l.quantity, unitPrice: money(l.unitPrice), total: money(l.lineTotal) })),
                    totals: [['المجموع', money(doc.subtotal)], ['الخصم', money(doc.discount)], ['المتبقي', money(doc.balance)]],
                    notes: doc.notes,
                    journalRef: doc.status === 'POSTED' ? doc.reference || doc.number : undefined,
                  })}
                />
                {doc.status === 'POSTED' && canWrite && doc.paymentState !== 'PAID' ? (
                  <Button variant="primary" onClick={() => setPayTarget(doc)}>تسجيل دفعة</Button>
                ) : null}
              </>
            ) : null
          }
          actions={
            !locked ? (
              <>
                <Button variant="secondary" type="submit" form="purchase-doc" disabled={saving}>
                  {saving ? 'جارٍ الحفظ' : 'حفظ مسودة'}
                </Button>
                <Button variant="primary" disabled={saving} onClick={postDoc}>
                  اعتماد وترحيل
                </Button>
              </>
            ) : null
          }
          menu={[
            ...(doc && !locked ? [{ label: 'حذف المسودة', danger: true, disabled: saving, onClick: discard } satisfies DocAction] : []),
            ...(doc?.status === 'POSTED' && canManage
              ? [{ label: 'إلغاء الفاتورة', danger: true, onClick: () => { setReason(''); setReasonOpen({ kind: 'void' }); } } satisfies DocAction]
              : []),
          ]}
          notice={doc?.status === 'VOID' ? `أُلغيت الفاتورة: ${doc.voidReason}` : undefined}
          header={
            <>
              <Field label="المورد" className="is-span-2">
                {locked ? (
                  <Input value={suppliers.find((row) => row.id === form.supplierId)?.name || doc?.supplierName || ''} disabled />
                ) : (
                  <Combobox
                    value={form.supplierId}
                    placeholder="ابحث عن المورد"
                    options={suppliers
                      .filter((row) => row.status === 'ACTIVE' || row.id === form.supplierId)
                      .map((row) => ({ value: row.id, label: row.name, keywords: row.phone }))}
                    onChange={(supplierId) => setForm({ ...form, supplierId })}
                    onCreate={canManage ? openQuickSupplier : undefined}
                  />
                )}
              </Field>
              <Field label="التاريخ">
                <Input type="date" required disabled={locked} value={form.transactionDate} onChange={(event) => setForm({ ...form, transactionDate: event.target.value })} />
              </Field>
              <Field label="المرجع">
                <Input disabled readOnly value={doc?.reference || doc?.number || 'يُحدَّد عند الحفظ'} />
              </Field>
              <Field
                label="العملة"
                hint={form.currency !== 'USD' && doc?.fxRate ? `سعر الصرف المسجل ${form.fxRate} مقابل الدولار` : undefined}
              >
                <Select
                  value={form.currency}
                  disabled={locked}
                  options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(currency) => setForm({ ...form, currency: currency as CurrencyCode })}
                />
              </Field>
              <Field label="المكتب">
                {actor.role === 'GENERAL_MANAGER' ? (
                  <Select
                    value={form.locationId}
                    disabled={locked}
                    placeholder="المكتب"
                    options={locations.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                    onChange={(locationId) => setForm({ ...form, locationId })}
                  />
                ) : (
                  <Input value={doc?.locationName || locations.find((row) => row.id === form.locationId)?.name || ''} disabled readOnly />
                )}
              </Field>
              <Field label="المستودع">
                <Select
                  value={form.warehouseId}
                  disabled={locked}
                  placeholder="المستودع"
                  options={warehouses.filter((row) => row.status === 'ACTIVE').map((row) => ({ value: row.id, label: row.name }))}
                  onChange={(warehouseId) => setForm({ ...form, warehouseId })}
                />
              </Field>
              {!locked ? (
                <Field label="دفعة للمورد">
                  <Select
                    value={applyAdvanceId}
                    onChange={setApplyAdvanceId}
                    placeholder="بلا دفعة"
                    options={advances
                      .filter((item) => !form.supplierId || item.supplierId === form.supplierId)
                      .map((item) => ({ value: item.id, label: `${item.partyName} — ${item.remaining}` }))}
                  />
                </Field>
              ) : (
                <Field label="الموظف">
                  <Input value={doc?.employeeName || actor.name} disabled readOnly />
                </Field>
              )}
              <Field label="ملاحظات" className="is-span-4">
                <Input
                  disabled={locked}
                  placeholder="أضف ملاحظات الفاتورة..."
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </Field>
            </>
          }
          lines={
            <div ref={linesRef} onKeyDown={onLinesKey} className="dp-lines-inner">
              <div className="dp-lines-bar">
                <h3>البنود</h3>
                {!locked ? (
                  <>
                    <div className="dp-barcode">
                      <BarcodeScan quiet onScan={scanLine} />
                    </div>
                    <Button variant="secondary" onClick={addLine}>
                      + بند جديد
                    </Button>
                  </>
                ) : null}
              </div>
              <table className="dp-lines-table">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col />
                  <col style={{ width: 84 }} />
                  <col style={{ width: 124 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="is-item">الصنف</th>
                    <th className="is-desc">الوصف</th>
                    <th className="is-qty">الكمية</th>
                    <th className="is-price">سعر التكلفة</th>
                    <th className="is-disc">الخصم</th>
                    <th className="is-sum is-num">الإجمالي</th>
                    <th className="is-x" aria-label="حذف"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => {
                    const product = products.find((item) => item.id === line.productId);
                    return (
                      <tr key={line.key}>
                        <td className="is-item">
                          {locked ? (
                            doc?.lines[index]?.productName
                          ) : (
                            <Combobox
                              value={line.productId}
                              placeholder="ابحث عن الصنف"
                              options={productOptions}
                              onChange={(productId) => {
                                const picked = products.find((item) => item.id === productId);
                                const lines = form.lines.slice();
                                lines[index] = {
                                  ...line,
                                  productId,
                                  unitPrice: picked?.costPrice || line.unitPrice,
                                  description: null,
                                };
                                setForm({ ...form, lines });
                                requestAnimationFrame(() => {
                                  linesRef.current?.querySelectorAll<HTMLElement>('tbody tr')[index]?.querySelector<HTMLInputElement>('input.is-amount')?.select();
                                });
                              }}
                              onCreate={canManage ? (name) => openQuickProduct(name, line.key) : undefined}
                            />
                          )}
                          {product ? <small className="dp-line-stock">{UNITS[product.unit] || product.unit} · رصيد {product.onHand}</small> : null}
                        </td>
                        <td className="is-desc">
                          <Input
                            disabled={locked}
                            value={line.description ?? product?.notes ?? ''}
                            placeholder="وصف البند"
                            onChange={(event) => {
                              const lines = form.lines.slice();
                              lines[index] = { ...line, description: event.target.value };
                              setForm({ ...form, lines });
                            }}
                          />
                        </td>
                        <td className="is-qty">
                          <Input
                            className="is-amount"
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
                        <td className="is-price">
                          <Input
                            className="is-amount"
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
                        <td className="is-disc">
                          <Input
                            className="is-amount"
                            inputMode="decimal"
                            disabled={locked}
                            value={line.discount}
                            placeholder="0"
                            onChange={(event) => {
                              const lines = form.lines.slice();
                              lines[index] = { ...line, discount: event.target.value };
                              setForm({ ...form, lines });
                            }}
                          />
                        </td>
                        <td className="is-sum is-num">{money(lineAmount(line))}</td>
                        <td className="is-x">
                          {!locked && form.lines.length > 1 ? (
                            <button
                              type="button"
                              className="dp-line-del"
                              aria-label="حذف السطر"
                              title="حذف السطر"
                              onClick={() => setForm({ ...form, lines: form.lines.filter((item) => item.key !== line.key) })}
                            >
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
                  })}
                </tbody>
              </table>
              {!locked ? (
                <p className="dp-lines-hint">
                  <kbd>Enter</kbd> الحقل التالي / سطر جديد · <kbd>Ctrl</kbd>+<kbd>S</kbd> حفظ المسودة · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ترحيل
                </p>
              ) : null}
            </div>
          }
          totals={
            <SummaryList>
              <SummaryRow label="المجموع" value={`${money(locked && doc ? doc.subtotal : subtotal)} ${form.currency}`} />
              <div>
                <dt>الخصم</dt>
                <dd className="ent-doc-discount">
                  <Input
                    className="is-amount"
                    inputMode="decimal"
                    disabled={locked}
                    value={form.discount}
                    placeholder="0"
                    onChange={(event) => setForm({ ...form, discount: event.target.value })}
                  />
                </dd>
              </div>
              <SummaryRow net label="الصافي" value={`${money(locked && doc ? doc.total : total)} ${form.currency}`} />
              {doc?.status === 'POSTED' ? <SummaryRow warn={Number(doc.balance) > 0} label="المتبقي" value={`${money(doc.balance)} ${doc.currency}`} /> : null}
            </SummaryList>
          }
          journal={
            <JournalImpact
              sourceType="PURCHASE"
              sourceId={doc?.status === 'POSTED' ? doc.id : null}
              refreshKey={journalKey}
              pending={
                doc?.status === 'VOID' ? (
                  'أُلغيت الفاتورة وعُكس قيدها المحاسبي.'
                ) : (
                  <>
                    <p className="ji-state">أثر متوقع عند الترحيل (القيد الفعلي يظهر هنا بعد الترحيل):</p>
                    <ImpactList
                      items={[
                        { label: 'ذمة المورد ترتفع', value: `${money(total)} ${form.currency}` },
                        { label: 'المخزون يزيد بكميات البنود', value: `${form.lines.filter((line) => line.productId).length} صنف` },
                      ]}
                    />
                  </>
                )
              }
            />
          }
          related={
            doc?.status === 'POSTED' ? (
              <section className="dp-card sl-payments">
                <h3>الدفعات والتسويات</h3>
                {doc.payments.length === 0 && Number(doc.balance) > 0 ? <p>لا دفع بعد. المتبقي كامل على الفاتورة.</p> : null}
                {doc.payments.length === 0 && Number(doc.balance) <= 0 ? <p>الفاتورة مغلقة.</p> : null}
                {doc.payments.map((payment) => (
                  <div key={payment.id} className={payment.status === 'REVERSED' ? 'is-reversed' : ''}>
                    <span>
                      {payment.transactionDate} · {money(payment.amount)} · {payment.outcomeReference}
                    </span>
                    <span>{payment.status === 'POSTED' ? 'قائم' : 'ملغى'}</span>
                    {payment.status === 'POSTED' && canManage ? (
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          setReason('');
                          setReasonOpen({ kind: 'reverse', paymentId: payment.id });
                        }}
                      >
                        عكس الدفع
                      </Button>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null
          }
        />
      ) : null}

      {quick ? (
        <QuickCreateDialog
          title={quick.kind === 'supplier' ? 'مورد جديد' : 'صنف جديد'}
          saving={quickSaving}
          error={quickError}
          onClose={() => setQuick(null)}
          onSubmit={saveQuick}
        >
          <Field label="الاسم">
            <Input required value={quickName} onChange={(event) => setQuickName(event.target.value)} />
          </Field>
          {quick.kind === 'supplier' ? (
            <Field label="الهاتف">
              <Input value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} />
            </Field>
          ) : (
            <Field label="سعر التكلفة">
              <Input inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} />
            </Field>
          )}
        </QuickCreateDialog>
      ) : null}

      {payTarget ? (
        <PayDialog
          invoice={payTarget}
          projects={outcomeProjects}
          banks={banks}
          onClose={() => setPayTarget(null)}
          onDone={async (saved) => {
            if (doc?.id === saved.id) setDoc(saved);
            setPayTarget(null);
            push('تم إنشاء السند.', 'ok');
            onChanged?.();
            await reload();
          }}
        />
      ) : null}

      {reasonOpen ? (
        <Modal front danger={reasonOpen.kind === 'void'} title={reasonOpen.kind === 'void' ? 'إلغاء الفاتورة' : 'عكس الدفع'} onClose={() => setReasonOpen(null)}>
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
                push(reasonOpen.kind === 'void' ? 'تم إلغاء الفاتورة.' : 'عُكس الدفع.', 'ok');
                onChanged?.();
                await reload();
              } catch (error) {
                push(masterErrorMessage(error), 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            <p className="dlg-message">
              {reasonOpen.kind === 'void' ? 'تأكيد الإلغاء يعكس القيد ويخرج المخزون.' : 'تأكيد عكس الدفع يعيد المبلغ إلى ذمة المورد.'}
            </p>
            <Field label="السبب">
              <Textarea required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <ModalFooter formId="purchase-reason" onCancel={() => setReasonOpen(null)} saveLabel="تأكيد" saving={saving} />
          </form>
        </Modal>
      ) : null}

      {supplierForm ? (
        <SupplierDialog
          rows={rows}
          canManage={canManage}
          canInvoice={canWrite}
          initial={supplierForm === 'new' ? null : supplierForm}
          onClose={() => {
            setSupplierForm(null);
            if (screen === 'supplier') window.location.hash = '#purchases/suppliers';
          }}
          onInvoice={(supplierId) => {
            setSupplierForm(null);
            requestPaletteOpen({ kind: 'purchase-draft', supplierId });
          }}
          onOpenInvoice={(id) => {
            sessionStorage.setItem('unigate.openPurchaseInvoice', id);
            setSupplierForm(null);
            window.location.hash = '#purchases/purchases';
          }}
          onDone={async (message) => {
            setSupplierForm(null);
            push(message, 'ok');
            await reload();
            if (screen === 'supplier') window.location.hash = '#purchases/suppliers';
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
  invoice: PayTarget;
  projects: ProjectRow[];
  banks: NamedRecord[];
  onClose: () => void;
  onDone: (row: PurchaseInvoiceDetail) => Promise<void>;
}) {
  const { push, node: toasts } = useToasts();
  const [saving, setSaving] = useState(false);
  const [fund, setFund] = useState<OperationFund>('VAULT');
  const [bankId, setBankId] = useState(banks[0]?.id || '');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [amount, setAmount] = useState(invoice.balance);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  return (
    <SlideOver front title={`تسجيل دفعة ${invoice.number}`} onClose={onClose} footer={
      <>
        <button type="button" className="ent-quiet" onClick={onClose}>إلغاء</button>
        <button type="submit" form="purchase-pay" className="ent-primary" disabled={saving || !projectId}>
          {saving ? 'جارٍ الحفظ' : 'تسجيل الدفع'}
        </button>
      </>
    }>
      {toasts}
      <form
        id="purchase-pay"
        className="ent-form"
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
          <Select
            value={projectId}
            placeholder="مشروع الصادر"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={setProjectId}
          />
        </label>
        <label>
          الصندوق
          <Select
            value={fund}
            options={INCOME_FUNDS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setFund(value as OperationFund)}
          />
        </label>
        {fund === 'BANK' ? (
          <label>
            البنك
            <Select
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
      </form>
    </SlideOver>
  );
}

function SupplierDialog({
  rows,
  initial,
  canManage,
  canInvoice,
  onClose,
  onInvoice,
  onOpenInvoice,
  onDone,
}: {
  rows: PurchaseInvoiceSummary[];
  initial: SupplierRow | null;
  canManage: boolean;
  canInvoice: boolean;
  onClose: () => void;
  onInvoice: (supplierId: string) => void;
  onOpenInvoice: (id: string) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { push, node: toasts } = useToasts();
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [status, setStatus] = useState<RecordStatus>(initial?.status || 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const locked = !canManage;
  const supplierInvoices = rows.filter((row) => initial && row.supplierName === initial.name);
  const exposure = openExposure(supplierInvoices);
  const postedCount = supplierInvoices.filter((row) => row.status === 'POSTED').length;

  return (
    <SlideOver
      wide
      title={initial ? initial.name : 'مورد جديد'}
      onClose={onClose}
      footer={
        canManage || (initial && canInvoice) ? (
          <div className="ent-party-foot">
            {initial && canInvoice ? (
              <button type="button" className="ent-quiet" onClick={() => onInvoice(initial.id)}>
                فاتورة جديدة
              </button>
            ) : (
              <span />
            )}
            {canManage ? (
              <button type="submit" form="purchase-supplier" className="ent-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ' : initial ? 'حفظ التعديلات' : 'إنشاء المورد'}
              </button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {toasts}
      <form
        id="purchase-supplier"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canManage) return;
          setSaving(true);
          try {
            const body = { name, phone, address, notes, status };
            if (initial) await updateSupplier(initial.id, body);
            else await createSupplier(body);
            await onDone(initial ? 'تم تعديل المورد.' : 'تم إنشاء المورد.');
          } catch (error) {
            push(masterErrorMessage(error), 'err');
          } finally {
            setSaving(false);
          }
        }}
      >
        <section className="ent-party-block">
          <h3>البيانات الأساسية</h3>
          <div className="sl-grid">
            <Field label="الاسم"><Input required disabled={locked} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="الهاتف"><Input disabled={locked} value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
            <Field label="العنوان"><Input disabled={locked} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
            <Field label="ملاحظات"><Textarea disabled={locked} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
            <Field label="الحالة">
              <Select
                value={status}
                disabled={locked}
                options={[
                  { value: 'ACTIVE', label: 'نشط' },
                  { value: 'INACTIVE', label: 'موقوف' },
                ]}
                onChange={(value) => setStatus(value as RecordStatus)}
              />
            </Field>
          </div>
        </section>
        <section className="ent-party-block">
          <h3>الائتمان</h3>
          <div className="ent-party-kpis">
            {exposure.map(([currency, amount]) => (
              <div key={currency} className="ent-party-kpi">
                <span>الذمة المفتوحة · {currency}</span>
                <strong>{money(amount)}</strong>
              </div>
            ))}
            <div className="ent-party-kpi">
              <span>فواتير مرحّلة</span>
              <strong>{postedCount}</strong>
            </div>
          </div>
        </section>
        {initial ? (
          <section className="ent-party-block">
            <div className="ent-doc-tools">
              <h3>كشف الفواتير والمدفوعات</h3>
              {canManage ? (
                <button
                  type="button"
                  className="ent-quiet is-danger"
                  disabled={saving}
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: 'حذف المورد',
                      message: `حذف ${initial.name}؟ إذا كان مرتبطاً بفواتير سيُوقف بدل الحذف.`,
                      confirmLabel: 'حذف أو إيقاف',
                      danger: true,
                    });
                    if (!ok) return;
                    setSaving(true);
                    try {
                      const result = await deleteSupplier(initial.id);
                      await onDone(result.deactivated ? 'المورد مرتبط بفواتير فأُوقف.' : 'تم حذف المورد.');
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
            </div>
            <div className="ent-table-wrap">
              <table className="ent-table is-clickable ent-party-table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th className="is-num">الإجمالي</th>
                    <th className="is-num">المدفوع</th>
                    <th className="is-num">المتبقي</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierInvoices.map((row) => (
                    <tr key={row.id} onClick={() => onOpenInvoice(row.id)}>
                      <td>{row.number}</td>
                      <td>{row.transactionDate}</td>
                      <td className="is-num">{money(row.total)} {row.currency}</td>
                      <td className="is-num">{money(row.paid)}</td>
                      <td className="is-num">{money(row.balance)}</td>
                      <td><span className={`ent-badge ${purchaseBadge(row).tone}`}>{purchaseBadge(row).label}</span></td>
                    </tr>
                  ))}
                  {supplierInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ent-empty">لا فواتير لهذا المورد.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </form>
    </SlideOver>
  );
}

function openExposure(rows: { status: string; currency: string; balance: string }[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== 'POSTED') continue;
    const amount = Number(row.balance);
    if (!Number.isFinite(amount)) continue;
    map.set(row.currency, (map.get(row.currency) || 0) + amount);
  }
  const list = [...map.entries()];
  return list.length > 0 ? list : [['USD', 0] as const];
}
