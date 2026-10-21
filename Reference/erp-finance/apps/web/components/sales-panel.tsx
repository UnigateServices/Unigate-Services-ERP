'use client';

import { Field, Input, Textarea } from './ui/field';

import { Button } from './ui/button';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthUser,
  CURRENCIES,
  CurrencyCode,
  DiscountMode,
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
  createProduct,
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
import { confirmAction } from '../lib/dialogs';
import { masterErrorMessage, statusLabel } from '../lib/master-errors';
import { DocumentStepper, invoiceStage } from './ui/document-stepper';
import { PrintButton } from './print/print-layout';
import { PALETTE_EVENT, dropPaletteOpen, peekPaletteOpen, requestPaletteOpen } from '../lib/palette-open';
import { Modal, ModalFooter } from './ui/modal';
import { addScannedLine, findScannedProduct } from '../lib/barcode';
import { BarcodeScan } from './barcode-scan';
import { Select } from './ui/select';
import { QuickCreateDialog, Combobox } from './ui/combobox';
import { SlideOver } from './ui/slide-over';
import { Badge, BadgeTone } from './ui/badge';
import { StatCard, StatGrid } from './ui/stat-card';
import { FilterPills } from './ui/page-toolbar';
import { DocumentPage, ImpactList, JournalImpact, ListPage, SummaryList, SummaryRow } from './ui/templates';
import type { DocAction } from './ui/templates';
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

const STATUS_LABEL: Record<SalesInvoiceStatus, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحّلة',
  VOID: 'ملغاة',
};

const PAY_LABEL = { UNPAID: 'غير مقبوضة', PARTIAL: 'قبض جزئي', PAID: 'مقبوضة' };

function invoiceBadge(row: { status: string; paymentState: string }) {
  if (row.status === 'VOID') return { tone: 'is-void', label: 'ملغاة' };
  if (row.status !== 'POSTED') return { tone: 'is-draft', label: 'مسودة' };
  if (row.paymentState === 'PAID') return { tone: 'is-paid', label: 'مرحّلة مقبوضة' };
  if (row.paymentState === 'PARTIAL') return { tone: 'is-partial', label: 'قبض جزئي' };
  return { tone: 'is-open', label: 'مرحّلة غير مقبوضة' };
}

const BADGE_TONE: Record<string, BadgeTone> = {
  'is-void': 'danger',
  'is-draft': 'neutral',
  'is-paid': 'ok',
  'is-partial': 'warn',
  'is-open': 'info',
};

type PayTarget = {
  id: string;
  number: string;
  balance: string;
  currency: string;
};

type LineDraft = {
  key: string;
  productId: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountMode: DiscountMode;
  discount: string;
};

type DocForm = {
  transactionDate: string;
  dueDate: string;
  customerId: string;
  customerReference: string;
  warehouseId: string;
  currency: CurrencyCode;
  fxRate: string;
  locationId: string;
  notes: string;
  discountMode: DiscountMode;
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
    discountMode: 'AMOUNT',
    discount: '',
  };
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function applyDiscount(gross: number, mode: DiscountMode, raw: string) {
  const value = Number(raw || 0);
  if (!Number.isFinite(gross) || !Number.isFinite(value) || value < 0) return gross;
  if (mode === 'PERCENT') return Math.max(0, gross - (gross * Math.min(value, 100)) / 100);
  return Math.max(0, gross - value);
}

function money(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function lineAmount(line: LineDraft) {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return applyDiscount(qty * price, line.discountMode, line.discount);
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

export function SalesPanel({
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
  screen?: 'invoices' | 'customers';
  onChanged?: () => void;
}) {
  const { push, node: toasts } = useToasts();
  const canManage = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR';
  const canWrite = actor.role !== 'MONITOR';
  const canOpenItems = actor.role === 'GENERAL_MANAGER' || actor.role === 'SUPERVISOR' || actor.role === 'MONITOR';
  const tab = screen;
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
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [reasonOpen, setReasonOpen] = useState<null | { kind: 'void' } | { kind: 'reverse'; paymentId: string }>(null);
  const [reason, setReason] = useState('');
  const [quick, setQuick] = useState<null | { kind: 'customer'; name: string } | { kind: 'product'; name: string; lineKey: string }>(null);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [journalKey, setJournalKey] = useState(0);
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

  useEffect(() => {
    if (tab !== 'invoices' || !ready) return;
    const handle = setTimeout(() => {
      reload().catch((error) => push(masterErrorMessage(error), 'err'));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
    if (!ready || screen !== 'invoices') return;
    const pending = sessionStorage.getItem('unigate.openSalesInvoice');
    if (!pending) return;
    sessionStorage.removeItem('unigate.openSalesInvoice');
    openExisting(pending).catch((error) => push(masterErrorMessage(error), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, screen]);

  useEffect(() => {
    if (!activeWarehouse) return;
    getProductCatalog({ warehouseId: activeWarehouse, filter: 'all' })
      .then((result) => setProducts(result.products.filter((item) => item.status === 'ACTIVE')))
      .catch(() => setProducts([]));
  }, [activeWarehouse]);

  const incomeProjects = projects.filter((project) => project.status === 'ACTIVE' && project.showIn.includes('INCOME'));

  function openNew(customerId = '') {
    const warehouseId = warehouses.find((site) => site.isDefault)?.id || warehouses[0]?.id || '';
    const person = customers.find((row) => row.id === customerId);
    setDoc(null);
    setForm({
      transactionDate: today(),
      customerId,
      warehouseId,
      currency: 'USD',
      fxRate: '',
      locationId: actor.locationId || locations[0]?.id || '',
      notes: '',
      dueDate: addDays(today(), person?.paymentTermDays || 0),
      customerReference: '',
      discountMode: 'AMOUNT',
      discount: '',
      lines: [blankLine()],
    });
  }

  useEffect(() => {
    function consume() {
      const item = peekPaletteOpen();
      if (!item) return;
      if (screen === 'customers' && item.kind === 'customer') {
        if (!ready) return;
        dropPaletteOpen();
        const row = customers.find((person) => person.id === item.id);
        if (row) setCustomerForm(row);
        else push('تعذر فتح ملف الزبون.', 'err');
        return;
      }
      if (screen !== 'invoices') return;
      if (item.kind === 'sales') {
        dropPaletteOpen();
        openExisting(item.id).catch((error) => push(masterErrorMessage(error), 'err'));
        return;
      }
      if (item.kind === 'sales-draft') {
        if (!ready) return;
        dropPaletteOpen();
        openNew(item.customerId);
      }
    }
    consume();
    window.addEventListener(PALETTE_EVENT, consume);
    return () => window.removeEventListener(PALETTE_EVENT, consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, screen, customers]);

  async function openExisting(id: string) {
    const detail = await getSalesInvoice(id);
    setDoc(detail);
    setForm({
      transactionDate: detail.transactionDate,
      dueDate: detail.dueDate || detail.transactionDate,
      customerId: detail.customerId,
      customerReference: detail.customerReference || '',
      warehouseId: detail.warehouseId,
      currency: detail.currency,
      fxRate: detail.fxRate ? String(Number(detail.fxRate)) : '',
      locationId: detail.locationId || '',
      notes: detail.notes,
      discountMode: detail.discountMode || 'AMOUNT',
      discount: detail.discountRate && detail.discountRate !== '0.00' ? detail.discountRate : '',
      lines: detail.lines.map((line) => ({
        key: line.id,
        productId: line.productId,
        description: null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountMode: line.discountMode || 'AMOUNT',
        discount: line.discountRate && line.discountRate !== '0.00' ? line.discountRate : '',
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
        discountMode: line.discountMode,
        discount: line.discount ? Number(line.discount) : 0,
      }));
    return {
      transactionDate: form.transactionDate,
      dueDate: form.dueDate || form.transactionDate,
      customerId: form.customerId,
      customerReference: form.customerReference,
      warehouseId: form.warehouseId,
      currency: form.currency,
      notes: form.notes,
      discountMode: form.discountMode,
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
      const saved = await (doc ? updateSalesInvoice(doc.id, body) : createSalesInvoice(body));
      await openExisting(saved.id);
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
    const ok = await confirmAction({
      title: 'ترحيل الفاتورة',
      message: 'ترحيل الفاتورة يثبت القيد المحاسبي ويحرّك المخزون. هل تريد المتابعة؟',
      confirmLabel: 'ترحيل',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const saved = doc ? await updateSalesInvoice(doc.id, body) : await createSalesInvoice(body);
      await postSalesInvoice(saved.id);
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

  const selectedCustomer = customers.find((row) => row.id === form?.customerId) || null;
  const customerHint = selectedCustomer
    ? [
        selectedCustomer.phone,
        selectedCustomer.city,
        selectedCustomer.taxNumber ? `ضريبي ${selectedCustomer.taxNumber}` : '',
        selectedCustomer.paymentTermDays ? `مهلة ${selectedCustomer.paymentTermDays} يوم` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const subtotal = form?.lines.reduce((sum, line) => sum + lineAmount(line), 0) ?? 0;
  const total = form ? applyDiscount(subtotal, form.discountMode, form.discount) : 0;
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
      lines: addScannedLine(form.lines, product.id, product.salePrice || '', blankLine()),
    });
  }

  function openQuickCustomer(name: string) {
    setQuickName(name);
    setQuickPhone('');
    setQuickPrice('');
    setQuickError('');
    setQuick({ kind: 'customer', name });
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
      if (quick.kind === 'customer') {
        const created = await createCustomer({ name: quickName.trim(), phone: quickPhone.trim() || undefined });
        setCustomers((list) => [created, ...list.filter((row) => row.id !== created.id)]);
        setForm((current) =>
          current
            ? {
                ...current,
                customerId: created.id,
                dueDate: addDays(current.transactionDate, created.paymentTermDays || 0),
              }
            : current,
        );
      } else {
        const price = quickPrice.trim() ? Number(quickPrice) : undefined;
        const created = await createProduct({ name: quickName.trim(), salePrice: Number.isFinite(price) ? price : undefined });
        setProducts((list) => [created, ...list.filter((row) => row.id !== created.id)]);
        setForm((current) =>
          current
            ? {
                ...current,
                lines: current.lines.map((line) =>
                  line.key === quick.lineKey
                    ? { ...line, productId: created.id, unitPrice: created.salePrice || line.unitPrice, description: null }
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

  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (tab !== 'customers' || !needle) return customers;
    return customers.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(needle));
  }, [customers, query, tab]);

  return (
    <div className="ui-page sl">
      {toasts}
      {tab === 'invoices' && !form ? (
        <ListPage
          title="فواتير المبيعات"
          newLabel="+ فاتورة جديدة"
          onNew={canWrite ? () => openNew() : undefined}
          kpis={
            <StatGrid>
              <StatCard label="فواتير ضمن العرض" value={rows.length} />
              <StatCard label="مسودات" value={rows.filter((row) => row.status === 'DRAFT').length} />
              <StatCard label="مرحّلة غير مسدّدة" value={rows.filter((row) => row.status === 'POSTED' && row.paymentState !== 'PAID').length} />
              {openExposure(rows).map(([currency, amount]) => (
                <StatCard key={currency} label={`الذمة المفتوحة · ${currency}`} value={money(amount)} />
              ))}
            </StatGrid>
          }
          search={query}
          onSearch={setQuery}
          searchPlaceholder="بحث بالرقم أو الزبون"
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
                    'فواتير-البيع.csv',
                    ['الرقم', 'التاريخ', 'الاستحقاق', 'الزبون', 'المستودع', 'الإجمالي', 'المتبقي', 'العملة', 'الحالة', 'الموظف'],
                    rows.map((row) => [
                      row.number,
                      row.transactionDate,
                      row.dueDate || '',
                      row.customerName,
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
            { key: 'customer', header: 'الزبون', render: (row) => row.customerName },
            { key: 'warehouse', header: 'المستودع', defaultHidden: true, render: (row) => row.warehouseName },
            { key: 'total', header: 'الإجمالي', numeric: true, render: (row) => `${money(row.total)} ${row.currency}` },
            { key: 'balance', header: 'المتبقي', numeric: true, defaultHidden: true, render: (row) => money(row.balance) },
            {
              key: 'status',
              header: 'الحالة',
              render: (row) => {
                const badge = invoiceBadge(row);
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
                    قبض دفعة
                  </Button>
                ) : null,
            },
          ]}
          rows={rows}
          tableId="sales-invoices"
          rowKey={(row) => row.id}
          onOpen={(row) => openExisting(row.id).catch((error) => push(masterErrorMessage(error), 'err'))}
          ready={ready}
          empty="لا فواتير في هذا العرض."
        />
      ) : null}
      {tab === 'customers' ? (
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
                <button type="button" className="ent-primary" onClick={() => setCustomerForm('new')}>
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
                  <th>المدينة</th>
                  <th>الرقم الضريبي</th>
                  <th>مهلة الدفع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((row) => (
                  <tr key={row.id} onClick={() => setCustomerForm(row)}>
                    <td>{row.name}</td>
                    <td>{row.phone || '—'}</td>
                    <td>{row.city || '—'}</td>
                    <td>{row.taxNumber || '—'}</td>
                    <td>{row.paymentTermDays ? `${row.paymentTermDays} يوم` : '—'}</td>
                    <td>
                      <span className={`ent-badge ${row.status === 'ACTIVE' ? 'is-paid' : 'is-draft'}`}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                ))}
                {ready && visibleCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="ent-empty">لا زبائن بعد.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {form && tab === 'invoices' ? (
        <DocumentPage
          formId="sales-doc"
          onSubmit={saveDraft}
          canSave={!locked && !saving}
          onPrimary={!locked && !saving ? postDoc : undefined}
          backLabel="الفواتير"
          onBack={closeDoc}
          title={doc ? `فاتورة ${doc.number}` : 'فاتورة جديدة'}
          badge={(() => {
            if (!doc) return <Badge>مسودة جديدة</Badge>;
            const badge = invoiceBadge(doc);
            return <Badge tone={BADGE_TONE[badge.tone] || 'neutral'}>{badge.label}</Badge>;
          })()}
          stage={doc ? invoiceStage(doc.status, doc.paymentState) : 'DRAFT'}
          tools={
            doc && locked ? (
              <>
                <PrintButton
                  getDoc={() => ({
                    title: 'فاتورة مبيعات',
                    number: doc.number,
                    date: doc.transactionDate,
                    currency: doc.currency,
                    total: money(doc.total),
                    status: doc.status === 'VOID' ? 'ملغاة' : doc.paymentState === 'PAID' ? 'مغلقة' : 'مرحّلة',
                    partyLabel: 'الزبون',
                    partyName: doc.customerName,
                    officeName: doc.locationName,
                    lines: doc.lines.map((l) => ({ name: l.productName, quantity: l.quantity, unitPrice: money(l.unitPrice), total: money(l.lineTotal) })),
                    totals: [['المجموع', money(doc.subtotal)], ['الخصم', money(doc.discount)], ['المتبقي', money(doc.balance)]],
                    notes: doc.notes,
                    journalRef: doc.status === 'POSTED' ? doc.reference || doc.number : undefined,
                  })}
                />
                {doc.status === 'POSTED' && canWrite && doc.paymentState !== 'PAID' ? (
                  <Button variant="primary" onClick={() => setPayTarget(doc)}>تسجيل قبض</Button>
                ) : null}
              </>
            ) : null
          }
          actions={
            !locked ? (
              <>
                <Button variant="secondary" type="submit" form="sales-doc" disabled={saving}>
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
              <Field label="الزبون" hint={customerHint || undefined} className="is-span-2">
                {locked ? (
                  <Input value={selectedCustomer?.name || doc?.customerName || ''} disabled />
                ) : (
                  <Combobox
                    value={form.customerId}
                    placeholder="ابحث عن الزبون"
                    options={customers
                      .filter((row) => row.status === 'ACTIVE' || row.id === form.customerId)
                      .map((row) => ({ value: row.id, label: row.name, keywords: `${row.phone} ${row.city}` }))}
                    onChange={(customerId) => {
                      const person = customers.find((row) => row.id === customerId);
                      setForm({
                        ...form,
                        customerId,
                        dueDate: addDays(form.transactionDate, person?.paymentTermDays || 0),
                      });
                    }}
                    onCreate={canManage ? openQuickCustomer : undefined}
                  />
                )}
              </Field>
              <Field label="التاريخ">
                <Input
                  type="date"
                  required
                  disabled={locked}
                  value={form.transactionDate}
                  onChange={(event) => setForm({ ...form, transactionDate: event.target.value })}
                />
              </Field>
              <Field label="تاريخ الاستحقاق">
                <Input
                  type="date"
                  required
                  disabled={locked}
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                />
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
              <Field label="المندوب">
                <Input value={doc?.employeeName || actor.name} disabled readOnly />
              </Field>
              <Field label="المرجع">
                <Input
                  disabled={locked}
                  value={form.customerReference}
                  placeholder={doc?.reference || 'رقم طلب الشراء'}
                  onChange={(event) => setForm({ ...form, customerReference: event.target.value })}
                />
              </Field>
              <Field label="ملاحظات" className="is-span-3">
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
                <col style={{ width: '26%' }} />
                <col />
                <col style={{ width: 84 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 44 }} />
              </colgroup>
                <thead>
                  <tr>
                    <th className="is-item">الصنف</th>
                    <th className="is-desc">الوصف</th>
                    <th className="is-qty">الكمية</th>
                    <th className="is-price">السعر الإفرادي</th>
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
                                  unitPrice: picked?.salePrice || line.unitPrice,
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
                          <div className="ent-line-discount">
                            <Select
                              value={line.discountMode}
                              disabled={locked}
                              options={[
                                { value: 'AMOUNT', label: 'مبلغ' },
                                { value: 'PERCENT', label: 'نسبة' },
                              ]}
                              onChange={(discountMode) => {
                                const lines = form.lines.slice();
                                lines[index] = { ...line, discountMode: discountMode as DiscountMode };
                                setForm({ ...form, lines });
                              }}
                            />
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
                          </div>
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
                  <Select
                    value={form.discountMode}
                    disabled={locked}
                    options={[
                      { value: 'AMOUNT', label: 'مبلغ' },
                      { value: 'PERCENT', label: 'نسبة' },
                    ]}
                    onChange={(discountMode) => setForm({ ...form, discountMode: discountMode as DiscountMode })}
                  />
                  <Input
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
              sourceType="SALES"
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
                        { label: 'ذمة الزبون ترتفع', value: `${money(total)} ${form.currency}` },
                        { label: 'المخزون ينقص بكميات البنود', value: `${form.lines.filter((line) => line.productId).length} صنف` },
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
                {doc.payments.length === 0 && Number(doc.balance) > 0 ? <p>لا قبض بعد. المتبقي كامل على الفاتورة.</p> : null}
                {doc.payments.length === 0 && Number(doc.balance) <= 0 ? <p>الفاتورة مغلقة.</p> : null}
                {doc.payments.map((payment) => (
                  <div key={payment.id} className={payment.status === 'REVERSED' ? 'is-reversed' : ''}>
                    <span>
                      {payment.transactionDate} · {money(payment.amount)} · {payment.incomeReference}
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
                        عكس القبض
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
          title={quick.kind === 'customer' ? 'زبون جديد' : 'صنف جديد'}
          saving={quickSaving}
          error={quickError}
          onClose={() => setQuick(null)}
          onSubmit={saveQuick}
        >
          <Field label="الاسم">
            <Input required value={quickName} onChange={(event) => setQuickName(event.target.value)} />
          </Field>
          {quick.kind === 'customer' ? (
            <Field label="الهاتف">
              <Input value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} />
            </Field>
          ) : (
            <Field label="سعر البيع">
              <Input inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} />
            </Field>
          )}
        </QuickCreateDialog>
      ) : null}

      {payTarget ? (
        <PayDialog
          invoice={payTarget}
          projects={incomeProjects}
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
        <Modal front danger={reasonOpen.kind === 'void'} title={reasonOpen.kind === 'void' ? 'إلغاء الفاتورة' : 'عكس القبض'} onClose={() => setReasonOpen(null)}>
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
                push(reasonOpen.kind === 'void' ? 'تم إلغاء الفاتورة.' : 'عُكس القبض.', 'ok');
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
              {reasonOpen.kind === 'void' ? 'تأكيد الإلغاء يعكس القيد ويعيد المخزون.' : 'تأكيد عكس القبض يعيد المبلغ إلى ذمة الزبون.'}
            </p>
            <Field label="السبب"><Textarea required minLength={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <ModalFooter formId="sales-reason" onCancel={() => setReasonOpen(null)} saveLabel="تأكيد" saving={saving} />
          </form>
        </Modal>
      ) : null}

      {customerForm ? (
        <CustomerPage
          rows={rows}
          initial={customerForm === 'new' ? null : customerForm}
          canManage={canManage}
          canInvoice={canWrite}
          onClose={() => setCustomerForm(null)}
          onInvoice={(customerId) => {
            setCustomerForm(null);
            requestPaletteOpen({ kind: 'sales-draft', customerId });
          }}
          onOpenInvoice={(id) => {
            sessionStorage.setItem('unigate.openSalesInvoice', id);
            setCustomerForm(null);
            window.location.hash = '#sales/sales';
          }}
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
  invoice: PayTarget;
  projects: ProjectRow[];
  banks: NamedRecord[];
  onClose: () => void;
  onDone: (row: SalesInvoiceDetail) => Promise<void>;
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
    <SlideOver front title={`قبض دفعة ${invoice.number}`} onClose={onClose} footer={
      <>
        <button type="button" className="ent-quiet" onClick={onClose}>إلغاء</button>
        <button type="submit" form="sales-pay" className="ent-primary" disabled={saving}>
          {saving ? 'جارٍ الحفظ' : 'تسجيل القبض'}
        </button>
      </>
    }>
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
        <Field label="التاريخ"><Input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="المبلغ"><Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="المشروع"><Select
            value={projectId}
            placeholder="مشروع الوارد"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            onChange={setProjectId}
          />
        </Field>
        <Field label="الصندوق"><Select
            value={fund}
            options={INCOME_FUNDS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setFund(value as OperationFund)}
          />
        </Field>
        {fund === 'BANK' ? (
          <Field label="البنك"><Select
              value={bankId}
              placeholder="البنك"
              options={banks.filter((bank) => bank.status === 'ACTIVE').map((bank) => ({ value: bank.id, label: bank.name }))}
              onChange={setBankId}
            />
          </Field>
        ) : null}
        <Field label="ملاحظة"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
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

function CustomerPage({
  rows,
  initial,
  canManage,
  canInvoice,
  onClose,
  onInvoice,
  onOpenInvoice,
  onDone,
}: {
  rows: SalesInvoiceSummary[];
  initial: CustomerRow | null;
  canManage: boolean;
  canInvoice: boolean;
  onClose: () => void;
  onInvoice: (customerId: string) => void;
  onOpenInvoice: (id: string) => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { push, node: toasts } = useToasts();
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [city, setCity] = useState(initial?.city || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber || '');
  const [paymentTermDays, setPaymentTermDays] = useState(String(initial?.paymentTermDays || 0));
  const [notes, setNotes] = useState(initial?.notes || '');
  const [status, setStatus] = useState<RecordStatus>(initial?.status || 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const locked = !canManage;
  const customerInvoices = rows.filter((row) => initial && row.customerId === initial.id);
  const exposure = openExposure(customerInvoices);
  const postedCount = customerInvoices.filter((row) => row.status === 'POSTED').length;

  return (
    <SlideOver
      wide
      title={initial ? initial.name : 'زبون جديد'}
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
              <button type="submit" form="sales-customer" className="ent-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ' : initial ? 'حفظ التعديلات' : 'إنشاء الزبون'}
              </button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {toasts}
      <form
        id="sales-customer"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canManage) return;
          setSaving(true);
          try {
            const body = {
              name,
              phone,
              email,
              city,
              address,
              taxNumber,
              paymentTermDays: Number(paymentTermDays || 0),
              notes,
              status,
            };
            if (initial) await updateCustomer(initial.id, body);
            else await createCustomer(body);
            await onDone(initial ? 'تم تعديل الزبون.' : 'تم إنشاء الزبون.');
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
            <Field label="البريد"><Input type="email" disabled={locked} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="المدينة"><Input disabled={locked} value={city} onChange={(event) => setCity(event.target.value)} /></Field>
            <Field label="العنوان"><Input disabled={locked} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
            <Field label="الرقم الضريبي"><Input disabled={locked} value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} /></Field>
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
            <Field label="ملاحظات"><Textarea disabled={locked} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          </div>
        </section>
        <section className="ent-party-block">
          <h3>الائتمان ومهلة الدفع</h3>
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
          <Field label="مهلة الدفع بالأيام">
            <Input inputMode="numeric" disabled={locked} value={paymentTermDays} onChange={(event) => setPaymentTermDays(event.target.value)} />
          </Field>
        </section>
        {initial ? (
          <section className="ent-party-block">
            <div className="ent-doc-tools">
              <h3>كشف الفواتير والمدفوعات</h3>
              <button
                type="button"
                className="ent-quiet"
                onClick={() =>
                  exportSheet(
                    `كشف-${initial.name}.csv`,
                    ['الرقم', 'التاريخ', 'الاستحقاق', 'الإجمالي', 'المدفوع', 'المتبقي', 'العملة', 'الحالة'],
                    customerInvoices.map((row) => [row.number, row.transactionDate, row.dueDate, row.total, row.paid, row.balance, row.currency, STATUS_LABEL[row.status]]),
                  )
                }
              >
                تصدير الكشف
              </button>
              {canManage ? (
                <button
                  type="button"
                  className="ent-quiet is-danger"
                  disabled={saving}
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: 'حذف الزبون',
                      message: `حذف ${initial.name}؟ إذا كان مرتبطاً بفواتير سيُوقف بدل الحذف.`,
                      confirmLabel: 'حذف أو إيقاف',
                      danger: true,
                    });
                    if (!ok) return;
                    setSaving(true);
                    try {
                      const result = await deleteCustomer(initial.id);
                      await onDone(result.deactivated ? 'الزبون مرتبط بفواتير فأُوقف.' : 'تم حذف الزبون.');
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
                  {customerInvoices.map((row) => (
                    <tr key={row.id} onClick={() => onOpenInvoice(row.id)}>
                      <td>{row.number}</td>
                      <td>{row.transactionDate}</td>
                      <td className="is-num">{money(row.total)} {row.currency}</td>
                      <td className="is-num">{money(row.paid)}</td>
                      <td className="is-num">{money(row.balance)}</td>
                      <td><span className={`ent-badge ${invoiceBadge(row).tone}`}>{invoiceBadge(row).label}</span></td>
                    </tr>
                  ))}
                  {customerInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ent-empty">لا فواتير لهذا الزبون.</td>
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
