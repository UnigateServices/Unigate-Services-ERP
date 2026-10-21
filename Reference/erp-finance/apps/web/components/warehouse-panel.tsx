'use client';

import { Badge } from './ui/badge';
import { Column, DataTable } from './ui/data-table';
import { FilterPills } from './ui/page-toolbar';
import { StatCard, StatGrid } from './ui/stat-card';
import { DocumentPage, ListPage, SummaryList, SummaryRow } from './ui/templates';

import { Field, Input, Textarea } from './ui/field';

import { Button } from './ui/button';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  ApiError,
  ProductInput,
  ProductRow,
  ProductUnit,
  RecordStatus,
  StockMoveRow,
  StockMoveType,
  WarehouseRow,
  CurrencyCode,
  createProduct,
  createStockMove,
  createWarehouse,
  deleteProduct,
  deleteProductImage,
  fetchProductImage,
  getProduct,
  getProductCatalog,
  scanProduct,
  listStockMoves,
  listWarehouses,
  updateProduct,
  updateWarehouse,
  uploadProductImage,
} from '../lib/api';
import { masterErrorMessage } from '../lib/master-errors';
import { Card } from './ui/card';
import { Modal, ModalFooter } from './ui/modal';
import { Select } from './ui/select';
import { useToasts } from './ui/toasts';
import './enterprise.css';

const UNITS: { value: ProductUnit; label: string }[] = [
  { value: 'PIECE', label: 'قطعة' },
  { value: 'KG', label: 'كغ' },
  { value: 'METER', label: 'متر' },
  { value: 'LITER', label: 'لتر' },
  { value: 'BOX', label: 'صندوق' },
  { value: 'SET', label: 'طقم' },
];

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'available', label: 'متوفر' },
  { id: 'low', label: 'تحت الحد' },
  { id: 'out', label: 'نفد' },
  { id: 'inactive', label: 'موقوف' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];
type SortId = 'name' | 'stock' | 'value';
type TabId = 'catalog' | 'moves';
type ViewId = 'list' | 'valuation';
type Sheet =
  | { kind: 'product'; id: string | null }
  | { kind: 'move'; id: string }
  | { kind: 'sites' }
  | null;

type FormState = {
  name: string;
  sku: string;
  barcode: string;
  unit: ProductUnit;
  costPrice: string;
  salePrice: string;
  minQuantity: string;
  notes: string;
  status: RecordStatus;
};

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  barcode: '',
  unit: 'PIECE',
  costPrice: '',
  salePrice: '',
  minQuantity: '0',
  notes: '',
  status: 'ACTIVE',
};

function unitLabel(unit: string | null | undefined) {
  return UNITS.find((item) => item.value === unit)?.label || unit || '';
}

function formatQty(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n);
}

function formatMoney(value: string | number | null | undefined) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
}

function lineValue(row: ProductRow) {
  if (!row.costPrice) return null;
  const n = Number(row.onHand) * Number(row.costPrice);
  return Number.isFinite(n) ? n : null;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function moveLabel(type: StockMoveType) {
  if (type === 'IN') return 'إدخال';
  if (type === 'OUT') return 'إخراج';
  return 'جرد';
}

function stockTone(row: Pick<ProductRow, 'status' | 'out' | 'low'>) {
  if (row.status === 'INACTIVE') return 'off';
  if (row.out) return 'out';
  if (row.low) return 'low';
  return 'ok';
}

function stockLabel(row: Pick<ProductRow, 'status' | 'out' | 'low'>) {
  const tone = stockTone(row);
  if (tone === 'off') return 'موقوف';
  if (tone === 'out') return 'نفد';
  if (tone === 'low') return 'تحت الحد';
  return 'متوفر';
}

function stockBadge(row: Pick<ProductRow, 'status' | 'out' | 'low'>) {
  const tone = stockTone(row);
  if (tone === 'ok') return 'is-paid';
  if (tone === 'low') return 'is-open';
  if (tone === 'out') return 'is-void';
  return 'is-draft';
}

function formFromProduct(product: ProductRow): FormState {
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    unit: product.unit,
    costPrice: product.costPrice || '',
    salePrice: product.salePrice || '',
    minQuantity: product.minQuantity,
    notes: product.notes,
    status: product.status,
  };
}

export function WarehousePanel({ actor }: { actor: AuthUser }) {
  const { push, node: toasts } = useToasts();
  const [tab, setTab] = useState<TabId>('catalog');
  const [view, setView] = useState<ViewId>('list');
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('name');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [kpis, setKpis] = useState({ products: 0, stockValue: '0', low: 0, movesToday: 0 });
  const [canManage, setCanManage] = useState(false);
  const [canMove, setCanMove] = useState(false);
  const [canAdjust, setCanAdjust] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [journal, setJournal] = useState<StockMoveRow[]>([]);
  const [journalReady, setJournalReady] = useState(false);
  const [journalQuery, setJournalQuery] = useState('');
  const [journalType, setJournalType] = useState<StockMoveType | 'ALL'>('ALL');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState('');

  const site = warehouses.find((row) => row.id === warehouseId) || null;
  const siteOpen = site?.status !== 'INACTIVE';

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function loadWarehouses() {
    const rows = await listWarehouses();
    setWarehouses(rows);
    setWarehouseId((current) => current || rows.find((row) => row.isDefault)?.id || rows[0]?.id || '');
    return rows;
  }

  async function loadCatalog(nextWarehouse = warehouseId || undefined) {
    const data = await getProductCatalog({
      warehouseId: nextWarehouse,
      q: debounced || undefined,
    });
    setWarehouseId(data.warehouseId);
    setProducts(data.products);
    setKpis(data.kpis);
    setCanManage(data.canManage);
    setCanMove(data.canMove);
    setCanAdjust(data.canAdjust);
    setCatalogReady(true);
    return data;
  }

  useEffect(() => {
    let dead = false;
    loadWarehouses().catch((err) => {
      if (!dead) setError(masterErrorMessage(err));
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (warehouseId === null) return;
    let dead = false;
    loadCatalog(warehouseId || undefined).catch((err) => {
      if (!dead) setError(masterErrorMessage(err));
    });
    return () => {
      dead = true;
    };
  }, [warehouseId, debounced]);

  useEffect(() => {
    if (tab !== 'moves' || !warehouseId) return;
    let dead = false;
    setJournalReady(false);
    listStockMoves({ warehouseId })
      .then((data) => {
        if (!dead) setJournal(data.movements);
      })
      .catch((err) => {
        if (!dead) setError(masterErrorMessage(err));
      })
      .finally(() => {
        if (!dead) setJournalReady(true);
      });
    return () => {
      dead = true;
    };
  }, [tab, warehouseId, kpis.movesToday]);

  const counts = useMemo(() => {
    return {
      all: products.length,
      available: products.filter((row) => row.status === 'ACTIVE' && !row.out).length,
      low: products.filter((row) => row.low).length,
      out: products.filter((row) => row.out && row.status === 'ACTIVE').length,
      inactive: products.filter((row) => row.status === 'INACTIVE').length,
    };
  }, [products]);

  const visible = useMemo(() => {
    let rows = products.slice();
    if (filter === 'available') rows = rows.filter((row) => row.status === 'ACTIVE' && !row.out);
    if (filter === 'low') rows = rows.filter((row) => row.low);
    if (filter === 'out') rows = rows.filter((row) => row.out && row.status === 'ACTIVE');
    if (filter === 'inactive') rows = rows.filter((row) => row.status === 'INACTIVE');
    rows.sort((a, b) => {
      if (sort === 'stock') return Number(b.onHand) - Number(a.onHand);
      if (sort === 'value') return (lineValue(b) || 0) - (lineValue(a) || 0);
      return a.name.localeCompare(b.name, 'ar');
    });
    return rows;
  }, [products, filter, sort]);

  const visibleJournal = useMemo(() => {
    const needle = journalQuery.trim().toLowerCase();
    return journal.filter((row) => {
      if (journalType !== 'ALL' && row.moveType !== journalType) return false;
      if (!needle) return true;
      return [row.reference, row.productName, row.sku, row.employeeName, row.notes]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [journal, journalQuery, journalType]);

  const catalogColumns: Column<ProductRow>[] = [
    { key: 'barcode', header: 'الباركود', defaultHidden: true, render: (row) => <span dir="ltr" className="wh-num">{row.barcode || '—'}</span> },
    { key: 'name', header: 'اسم المادة', render: (row) => <strong>{row.name}</strong> },
    { key: 'sku', header: 'الرمز', render: (row) => <span dir="ltr" className="wh-num">{row.sku || '—'}</span> },
    { key: 'warehouse', header: 'المستودع', defaultHidden: true, render: () => site?.name || '—' },
    { key: 'onHand', header: 'الرصيد المتوفر', numeric: true, render: (row) => <span dir="ltr" className="wh-num">{formatQty(row.onHand)}</span> },
    { key: 'unit', header: 'الوحدة', render: (row) => unitLabel(row.unit) },
    { key: 'cost', header: 'متوسط التكلفة', numeric: true, render: (row) => <span dir="ltr" className="wh-num">{formatMoney(row.costPrice)}</span> },
    {
      key: 'value',
      header: 'إجمالي القيمة',
      numeric: true,
      render: (row) => {
        const value = lineValue(row);
        return <span dir="ltr" className="wh-num">{value == null ? '—' : formatMoney(value)}</span>;
      },
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (row) => {
        const tone = stockTone(row);
        return <Badge tone={tone === 'ok' ? 'ok' : tone === 'low' ? 'warn' : tone === 'out' ? 'danger' : 'neutral'}>{stockLabel(row)}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      fixed: true,
      render: (row) =>
        canMove && siteOpen && row.status === 'ACTIVE' ? (
          <Button
            variant="mini"
            onClick={(event) => {
              event.stopPropagation();
              setSheet({ kind: 'move', id: row.id });
            }}
          >
            حركة
          </Button>
        ) : null,
    },
  ];

  const journalColumns: Column<StockMoveRow>[] = [
    { key: 'reference', header: 'المرجع', render: (row) => <strong dir="ltr" className="wh-num">{row.reference}</strong> },
    { key: 'product', header: 'الصنف', render: (row) => row.productName },
    { key: 'sku', header: 'الرمز', defaultHidden: true, render: (row) => <span dir="ltr" className="wh-num">{row.sku}</span> },
    {
      key: 'type',
      header: 'الحركة',
      render: (row) => <Badge tone={row.moveType === 'IN' ? 'ok' : row.moveType === 'OUT' ? 'danger' : 'warn'}>{moveLabel(row.moveType)}</Badge>,
    },
    {
      key: 'qty',
      header: 'الكمية',
      numeric: true,
      render: (row) => (
        <span dir="ltr" className="wh-num">
          {row.moveType === 'OUT' ? '−' : row.moveType === 'IN' ? '+' : ''}
          {formatQty(row.quantity)} {unitLabel(row.unit)}
        </span>
      ),
    },
    { key: 'employee', header: 'الموظف', render: (row) => row.employeeName },
    { key: 'notes', header: 'ملاحظات', defaultHidden: true, render: (row) => row.notes || '—' },
    { key: 'when', header: 'الوقت', render: (row) => formatWhen(row.createdAt) },
  ];

  function chooseWarehouse(id: string) {
    setWarehouseId(id);
    setSheet(null);
    setError('');
  }

  return (
    <div
      className="ent-page wh-root"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.key !== 'Enter' || tab !== 'catalog' || !target.classList.contains('ui-ptb-search')) return;
        event.preventDefault();
        const code = query.trim();
        if (!code) return;
        scanProduct(code, warehouseId || undefined)
          .then((product) => {
            setSheet({ kind: 'product', id: product.id });
            setQuery('');
          })
          .catch((err) => push(masterErrorMessage(err), 'err'));
      }}
    >
      {toasts}
      {site && !siteOpen ? <p className="wh-banner">هذا المستودع موقوف. الأرصدة متاحة للعرض، والحركات الجديدة غير مقبولة.</p> : null}
      {error ? <p className="wh-error">{error}</p> : null}
      {view === 'valuation' ? (
        <ValuationPage rows={products} warehouseName={site?.name || '—'} onBack={() => setView('list')} />
      ) : tab === 'catalog' ? (
        <ListPage
          title="المخزون"
          newLabel="+ صنف جديد"
          onNew={canManage ? () => setSheet({ kind: 'product', id: null }) : undefined}
          kpis={
            <StatGrid>
              <StatCard label="عدد الأصناف" value={<span dir="ltr" className="wh-num">{formatQty(kpis.products)}</span>} />
              <StatCard label="قيمة المخزون" value={<span dir="ltr" className="wh-num">{formatMoney(kpis.stockValue)}</span>} />
              <StatCard label="أصناف تحت الحد" value={<span dir="ltr" className="wh-num">{formatQty(kpis.low)}</span>} negative={kpis.low > 0} />
              <StatCard label="حركات اليوم" value={<span dir="ltr" className="wh-num">{formatQty(kpis.movesToday)}</span>} />
            </StatGrid>
          }
          search={query}
          onSearch={setQuery}
          searchPlaceholder="بحث بالاسم أو الباركود"
          filters={
            <>
              <FilterPills value={tab} onChange={setTab} options={[['catalog', 'الأصناف'], ['moves', 'سجل الحركات']] as const} />
              <FilterPills
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((item) => [item.id, `${item.label} (${counts[item.id]})`] as const)}
              />
              <div className="wh-site-select">
                <Select
                  value={warehouseId || ''}
                  options={warehouses.map((row) => ({ value: row.id, label: row.name }))}
                  onChange={chooseWarehouse}
                />
              </div>
            </>
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => setView('valuation')}>تقييم المخزون</Button>
              {actor.role === 'GENERAL_MANAGER' ? (
                <Button variant="secondary" onClick={() => setSheet({ kind: 'sites' })}>المستودعات</Button>
              ) : null}
            </>
          }
          columns={catalogColumns}
          rows={visible}
          rowKey={(row) => row.id}
          onOpen={(row) => setSheet({ kind: 'product', id: row.id })}
          ready={catalogReady}
          tableId="inventory-items"
          empty={Boolean(debounced) || filter !== 'all' ? 'لا أصناف تطابق هذا البحث.' : 'لا أصناف في المستودع بعد.'}
        />
      ) : (
        <ListPage
          title="سجل حركات المخزون"
          kpis={
            <StatGrid>
              <StatCard label="الحركات المعروضة" value={<span dir="ltr" className="wh-num">{visibleJournal.length}</span>} />
              <StatCard label="إدخال" value={<span dir="ltr" className="wh-num">{visibleJournal.filter((row) => row.moveType === 'IN').length}</span>} />
              <StatCard label="إخراج" value={<span dir="ltr" className="wh-num">{visibleJournal.filter((row) => row.moveType === 'OUT').length}</span>} />
              <StatCard label="جرد" value={<span dir="ltr" className="wh-num">{visibleJournal.filter((row) => row.moveType === 'ADJUST').length}</span>} />
            </StatGrid>
          }
          search={journalQuery}
          onSearch={setJournalQuery}
          searchPlaceholder="بحث بالمرجع أو الصنف"
          filters={
            <>
              <FilterPills value={tab} onChange={setTab} options={[['catalog', 'الأصناف'], ['moves', 'سجل الحركات']] as const} />
              <FilterPills
                value={journalType}
                onChange={setJournalType}
                options={[['ALL', 'الكل'], ['IN', 'إدخال'], ['OUT', 'إخراج'], ['ADJUST', 'جرد']] as const}
              />
            </>
          }
          columns={journalColumns}
          rows={visibleJournal}
          rowKey={(row) => row.id}
          onOpen={(row) => setSheet({ kind: 'product', id: row.productId })}
          ready={journalReady}
          tableId="inventory-moves"
          empty="لا حركات في هذا العرض."
        />
      )}
      {sheet?.kind === 'product' ? (
        <ProductDialog
          productId={sheet.id}
          warehouseId={warehouseId || ''}
          warehouseName={site?.name || ''}
          canManage={canManage}
          canMove={canMove && siteOpen}
          onClose={() => setSheet(null)}
          onOpenMove={(id) => setSheet({ kind: 'move', id })}
          onSaved={async (created) => {
            push(created ? 'تم حفظ الصنف.' : 'تم حفظ التعديل.');
            await loadCatalog();
          }}
          onCreated={(id) => setSheet({ kind: 'product', id })}
          onRemoved={async (deactivated) => {
            push(deactivated ? 'تم إيقاف الصنف.' : 'تم حذف الصنف.');
            setSheet(null);
            await loadCatalog();
          }}
        />
      ) : null}

      {sheet?.kind === 'move' ? (
        <MoveDialog
          productId={sheet.id}
          warehouseId={warehouseId || ''}
          warehouseName={site?.name || ''}
          canAdjust={canAdjust}
          onClose={() => setSheet(null)}
          onPosted={async () => {
            push('تم تسجيل الحركة.');
            setSheet(null);
            await loadCatalog();
          }}
        />
      ) : null}

      {sheet?.kind === 'sites' ? (
        <SitesDialog
          warehouses={warehouses}
          onClose={() => setSheet(null)}
          onChanged={async (nextId) => {
            await loadWarehouses();
            if (nextId) setWarehouseId(nextId);
            push('تم تحديث المستودعات.');
          }}
        />
      ) : null}
    </div>
  );
}

function ValuationPage({ rows, warehouseName, onBack }: { rows: ProductRow[]; warehouseName: string; onBack: () => void }) {
  const valued = useMemo(
    () => rows.filter((row) => row.status === 'ACTIVE').sort((a, b) => (lineValue(b) || 0) - (lineValue(a) || 0)),
    [rows],
  );
  const total = valued.reduce((sum, row) => sum + (lineValue(row) || 0), 0);
  const columns: Column<ProductRow>[] = [
    { key: 'name', header: 'الصنف', render: (row) => <strong>{row.name}</strong> },
    { key: 'sku', header: 'الرمز', defaultHidden: true, render: (row) => <span dir="ltr" className="wh-num">{row.sku || '—'}</span> },
    { key: 'onHand', header: 'الكمية', numeric: true, render: (row) => <span dir="ltr" className="wh-num">{formatQty(row.onHand)} {unitLabel(row.unit)}</span> },
    { key: 'cost', header: 'متوسط التكلفة', numeric: true, render: (row) => <span dir="ltr" className="wh-num">{formatMoney(row.costPrice)}</span> },
    { key: 'value', header: 'القيمة', numeric: true, render: (row) => <span dir="ltr" className="wh-num">{formatMoney(lineValue(row))}</span> },
  ];
  return (
    <DocumentPage
      backLabel="المخزون"
      onBack={onBack}
      title="تقييم المخزون"
      stage="POSTED"
      hideStepper
      formId="wh-valuation-form"
      onSubmit={(event) => event.preventDefault()}
      tools={<Button variant="secondary" onClick={() => window.print()}>طباعة</Button>}
      header={
        <>
          <Field label="المستودع"><Input value={warehouseName} readOnly /></Field>
          <Field label="التاريخ"><Input dir="ltr" value={new Date().toISOString().slice(0, 10)} readOnly /></Field>
          <Field label="عدد الأصناف"><Input dir="ltr" value={String(valued.length)} readOnly /></Field>
        </>
      }
      lines={<DataTable tableId="inventory-valuation" columns={columns} rows={valued} rowKey={(row) => row.id} empty="لا أصناف للتقييم." />}
      totals={
        <SummaryList>
          <SummaryRow label="إجمالي قيمة المخزون" value={<span dir="ltr" className="wh-num">{formatMoney(total)}</span>} net />
        </SummaryList>
      }
    />
  );
}

function ProductDialog({
  productId,
  warehouseId,
  warehouseName,
  canManage,
  canMove,
  onClose,
  onOpenMove,
  onSaved,
  onCreated,
  onRemoved,
}: {
  productId: string | null;
  warehouseId: string;
  warehouseName: string;
  canManage: boolean;
  canMove: boolean;
  onClose: () => void;
  onOpenMove: (id: string) => void;
  onSaved: (created: boolean) => Promise<void>;
  onCreated: (id: string) => void;
  onRemoved: (deactivated: boolean) => Promise<void>;
}) {
  const creating = !productId;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [moves, setMoves] = useState<StockMoveRow[]>([]);
  const [hasImage, setHasImage] = useState(false);
  const [imageStamp, setImageStamp] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!productId) {
      setForm(EMPTY_FORM);
      setProduct(null);
      setMoves([]);
      setHasImage(false);
      return;
    }
    let dead = false;
    getProduct(productId, warehouseId)
      .then((data) => {
        if (dead) return;
        setProduct(data.product);
        setForm(formFromProduct(data.product));
        setMoves(data.movements);
        setHasImage(data.product.hasImage);
        setImageStamp(data.product.updatedAt);
      })
      .catch((err) => {
        if (!dead) setError(masterErrorMessage(err));
      });
    return () => {
      dead = true;
    };
  }, [productId, warehouseId]);

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    const costPrice = optionalNumber(form.costPrice);
    const salePrice = optionalNumber(form.salePrice);
    const minQuantity = optionalNumber(form.minQuantity);
    if (costPrice === undefined || salePrice === undefined || minQuantity === undefined) {
      setError('أدخل أرقاماً صالحة للتكلفة وسعر البيع وحد إعادة الطلب.');
      return;
    }
    setBusy(true);
    setError('');
    const payload: ProductInput = {
      name: form.name,
      sku: form.sku || undefined,
      barcode: form.barcode,
      unit: form.unit,
      costPrice,
      salePrice,
      minQuantity: minQuantity ?? 0,
      notes: form.notes,
      status: form.status,
    };
    try {
      const saved = creating ? await createProduct(payload) : await updateProduct(productId || '', payload);
      if (creating && pendingImage) {
        try {
          await uploadProductImage(saved.id, pendingImage);
        } catch (err) {
          await onSaved(true);
          onCreated(saved.id);
          setError(masterErrorMessage(err));
          return;
        }
      }
      await onSaved(creating);
      if (creating) onCreated(saved.id);
      else {
        setProduct((current) => (current ? { ...saved, onHand: current.onHand, low: current.low, out: current.out } : saved));
        setForm(formFromProduct(saved));
      }
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function stageImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('اختر ملف صورة.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    if (!productId) {
      stageImage(file);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await uploadProductImage(productId, file);
      setHasImage(result.hasImage);
      setImageStamp(result.updatedAt);
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearImage() {
    if (!productId) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPendingImage(null);
      setPreviewUrl(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await deleteProductImage(productId);
      setHasImage(result.hasImage);
      setImageStamp(result.updatedAt);
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!productId) return;
    setBusy(true);
    setError('');
    try {
      const result = await deleteProduct(productId);
      await onRemoved(result.deactivated);
    } catch (err) {
      setError(masterErrorMessage(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const shown = product;
  const tone = shown ? stockTone(shown) : 'ok';

  const photoNode = (
            <div
              className={`wh-photo${dragOver ? ' is-over' : ''}`}
              onDragOver={(event) => {
                if (!canManage) return;
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                if (!canManage) return;
                void onImage(event.dataTransfer.files?.[0]);
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : productId && hasImage ? (
                <ProductPhoto id={productId} stamp={imageStamp} hasImage name={form.name} />
              ) : (
                <span className="wh-ph">{(form.name || 'ص').slice(0, 1)}</span>
              )}
              {canManage ? (
                <div className="wh-photo-actions">
                  <Field label={hasImage || previewUrl ? 'تغيير الصورة' : 'رفع صورة'}><input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => void onImage(event.target.files?.[0])}
                    />
                  </Field>
                  {hasImage || previewUrl ? (
                    <Button variant="secondary" type="button" onClick={() => void clearImage()}>
                      إزالة
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
  );
  const balanceNode = (
    <>
            {shown ? (
              <div className="wh-balance">
                <span>الرصيد في {warehouseName || 'المستودع'}</span>
                <strong className={`is-${tone}`}>
                  {formatQty(shown.onHand)} <small>{unitLabel(shown.unit)}</small>
                </strong>
                <em>{stockLabel(shown)} · الحد {formatQty(shown.minQuantity)}</em>
                {canMove && shown.status === 'ACTIVE' ? (
                  <Button variant="primary" type="button" onClick={() => onOpenMove(shown.id)}>
                    تسجيل حركة
                  </Button>
                ) : null}
              </div>
            ) : null}
    </>
  );

  return (
    <>
      <Modal
        className="wh-dialog wh-editor-dialog"
        wide
        title={creating ? 'صنف جديد' : shown?.name || 'الصنف'}
        onClose={() => {
          if (confirm) {
            setConfirm(false);
            return;
          }
          onClose();
        }}
        footer={
          canManage ? (
            <>
              <button type="button" className="ent-quiet" onClick={onClose}>إلغاء</button>
              <button type="submit" form="wh-product-form" className="ent-primary" disabled={busy}>
                {creating ? 'حفظ الصنف' : 'حفظ التعديل'}
              </button>
            </>
          ) : (
            <button type="button" className="ent-quiet" onClick={onClose}>إغلاق</button>
          )
        }
      >
        <div className="wh-editor">
          {error ? <p className="wh-error">{error}</p> : null}
          {!canManage ? photoNode : null}
          {balanceNode}

          {canManage ? (
            <form id="wh-product-form" className="wh-form invoice-head" onSubmit={saveProduct}>
              <div className="wh-top is-wide">
                {photoNode}
                <Field className="wh-top-name" label="الاسم"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={160} /></Field>
              </div>
              <Field label="الرمز"><Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="يُولَّد تلقائياً" maxLength={40} /></Field>
              <Field label="الباركود"><Input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} placeholder="اختياري" maxLength={64} /></Field>
              <Field label="الوحدة"><Select
                  value={form.unit}
                  options={UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
                  onChange={(value) => setForm({ ...form, unit: value as ProductUnit })}
                />
              </Field>
              <Field label="الحالة"><Select
                  value={form.status}
                  options={[
                    { value: 'ACTIVE', label: 'نشط' },
                    { value: 'INACTIVE', label: 'موقوف' },
                  ]}
                  onChange={(value) => setForm({ ...form, status: value as RecordStatus })}
                />
              </Field>
              <h3 className="is-wide">التسعير والحد</h3>
              <Field label="تكلفة الوحدة"><Input inputMode="decimal" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} />
              </Field>
              <Field label="سعر البيع"><Input inputMode="decimal" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} />
              </Field>
              <Field className="is-wide" label="حد إعادة الطلب" hint="إذا نزل الرصيد إلى هذا العدد أو دونه تظهر الحالة «تحت الحد»."><Input inputMode="decimal" value={form.minQuantity} onChange={(event) => setForm({ ...form, minQuantity: event.target.value })} />
              </Field>
              <Field className="is-wide" label="ملاحظات"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={1000} rows={3} />
              </Field>
              {!creating ? (
                <Button variant="danger" className="is-wide" type="button" onClick={() => setConfirm(true)}>
                  إيقاف الصنف أو حذفه
                </Button>
              ) : null}
            </form>
          ) : (
            <dl className="wh-facts">
              <div><dt>الرمز</dt><dd>{form.sku || '—'}</dd></div>
              <div><dt>الباركود</dt><dd>{form.barcode || '—'}</dd></div>
              <div><dt>الوحدة</dt><dd>{unitLabel(form.unit)}</dd></div>
              <div><dt>التكلفة</dt><dd>{formatMoney(form.costPrice)}</dd></div>
              <div><dt>سعر البيع</dt><dd>{formatMoney(form.salePrice)}</dd></div>
              <div><dt>حد إعادة الطلب</dt><dd>{formatQty(form.minQuantity || '0')}</dd></div>
              {form.notes ? <div className="is-wide"><dt>ملاحظات</dt><dd>{form.notes}</dd></div> : null}
            </dl>
          )}
        </div>
        {!creating && moves.length > 0 ? (
          <div className="wh-history">
            <h3>آخر الحركات في هذا المستودع</h3>
            <ul>
              {moves.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <span className={`wh-pill is-${row.moveType === 'IN' ? 'ok' : row.moveType === 'OUT' ? 'out' : 'low'}`}>{moveLabel(row.moveType)}</span>
                  <span>
                    <strong>{row.reference}</strong>
                    <small>{row.employeeName} · {formatWhen(row.createdAt)}</small>
                  </span>
                  <b>
                    {row.moveType === 'OUT' ? '−' : row.moveType === 'IN' ? '+' : ''}
                    {formatQty(row.quantity)}
                  </b>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>
      {confirm ? (
        <Modal
          danger
          className="wh-dialog"
          title="إيقاف أو حذف الصنف"
          onClose={() => setConfirm(false)}
          footer={
            <ModalFooter
              onCancel={() => setConfirm(false)}
              onSave={() => void retire()}
              saveLabel="تأكيد"
              saving={busy}
            />
          }
        >
          <p className="wh-confirm">
            الصنف <strong>{form.name}</strong> يُحذف نهائياً إذا لم تكن له حركات مخزون. إذا وُجدت حركات يُوقف ويبقى في السجل.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function MoveDialog({
  productId,
  warehouseId,
  warehouseName,
  canAdjust,
  onClose,
  onPosted,
}: {
  productId: string;
  warehouseId: string;
  warehouseName: string;
  canAdjust: boolean;
  onClose: () => void;
  onPosted: () => Promise<void>;
}) {
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [costCurrency, setCostCurrency] = useState<CurrencyCode>('USD');
  const [functionalCurrency, setFunctionalCurrency] = useState<CurrencyCode>('USD');
  const [fxRate, setFxRate] = useState('');
  const [moveType, setMoveType] = useState<StockMoveType>('IN');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    getProduct(productId, warehouseId)
      .then((data) => {
        if (!dead) {
          setProduct(data.product);
          setCostCurrency(data.costCurrency);
          setFunctionalCurrency(data.functionalCurrency);
        }
      })
      .catch((err) => {
        if (!dead) setError(masterErrorMessage(err));
      });
    return () => {
      dead = true;
    };
  }, [productId, warehouseId]);

  const onHand = Number(product?.onHand || 0);
  const amount = Number(qty);
  const amountOk = qty.trim() !== '' && Number.isFinite(amount) && amount >= 0 && (moveType === 'ADJUST' || amount > 0);
  const next = !amountOk
    ? null
    : moveType === 'IN'
      ? onHand + amount
      : moveType === 'OUT'
        ? onHand - amount
        : amount;
  const needsRate = costCurrency !== functionalCurrency;
  const blocked = next != null && (next < 0 || (moveType === 'ADJUST' && next === onHand));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amountOk || blocked || next == null) {
      setError(next != null && next < 0 ? 'الكمية أكبر من الرصيد المتوفر.' : 'أدخل كمية صالحة.');
      return;
    }
    if (!product?.costPrice || Number(product.costPrice) <= 0) {
      setError(masterErrorMessage(new ApiError('COST_REQUIRED', 'COST_REQUIRED')));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createStockMove({
        productId,
        warehouseId,
        moveType,
        quantity: amount,
        notes,
      });
      await onPosted();
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      className="wh-dialog wh-move-dialog"
      title="تسجيل حركة"
      onClose={onClose}
      footer={
        <ModalFooter
          formId="wh-move-form"
          onCancel={onClose}
          saveLabel="تسجيل الحركة"
          saving={busy}
          submitDisabled={!product || product.status !== 'ACTIVE' || !amountOk || blocked}
        />
      }
    >
      <form id="wh-move-form" className="wh-move" onSubmit={submit}>
        {error ? <p className="wh-error">{error}</p> : null}
        <div className="wh-move-product">
          <span className="wh-thumb">
            {product ? <ProductPhoto id={product.id} stamp={product.updatedAt} hasImage={product.hasImage} name={product.name} /> : <span className="wh-ph">ص</span>}
          </span>
          <div>
            <strong>{product?.name || '...'}</strong>
            <small>{product ? `${product.sku} · ${warehouseName}` : warehouseName}</small>
          </div>
          <b>{product ? formatQty(product.onHand) : '—'} <small>{unitLabel(product?.unit)}</small></b>
        </div>
        <div className="wh-move-types">
          <Button variant="choice" className={moveType === 'IN' ? 'is-on' : ''} type="button" onClick={() => setMoveType('IN')}>
            <strong>إدخال</strong>
            <span>إضافة كمية إلى الرصيد</span>
          </Button>
          <Button variant="choice" className={moveType === 'OUT' ? 'is-on' : ''} type="button" onClick={() => setMoveType('OUT')}>
            <strong>إخراج</strong>
            <span>صرف كمية من الرصيد</span>
          </Button>
          {canAdjust ? (
            <Button variant="choice" className={moveType === 'ADJUST' ? 'is-on' : ''} type="button" onClick={() => setMoveType('ADJUST')}>
              <strong>جرد</strong>
              <span>تثبيت الرصيد على الكمية المعدودة</span>
            </Button>
          ) : null}
        </div>
        <Field label={moveType === 'ADJUST' ? 'الكمية المعدودة' : 'الكمية'}><Input inputMode="decimal" value={qty} onChange={(event) => setQty(event.target.value)} required autoFocus />
        </Field>
        <Field label="ملاحظة"><Input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="سبب الحركة، اختياري" />
        </Field>
        <p className="ui-note">تُرحَّل الحركة إلى حساب المخزون بتكلفة الصنف الحالية. الزيادة فائض والنقص عجز.</p>
        <div className={`wh-preview${blocked ? ' is-bad' : ''}`}>
          <span>الرصيد بعد الحركة</span>
          <strong>{next == null ? '—' : formatQty(next)} {unitLabel(product?.unit)}</strong>
          {moveType === 'ADJUST' && next != null && next === onHand ? <em>الكمية المعدودة مطابقة للرصيد الحالي.</em> : null}
          {next != null && next < 0 ? <em>لا يمكن أن يصبح الرصيد سالباً.</em> : null}
        </div>
      </form>
    </Modal>
  );
}

function SitesDialog({
  warehouses,
  onClose,
  onChanged,
}: {
  warehouses: WarehouseRow[];
  onClose: () => void;
  onChanged: (nextId?: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(warehouses.map((row) => [row.id, row.name])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function addSite(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const row = await createWarehouse(name.trim());
      setName('');
      await onChanged(row.id);
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveName(row: WarehouseRow) {
    const next = (drafts[row.id] || '').trim();
    if (!next || next === row.name) return;
    setBusy(true);
    setError('');
    try {
      await updateWarehouse(row.id, { name: next });
      await onChanged();
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(row: WarehouseRow, input: { status?: RecordStatus; isDefault?: boolean }) {
    setBusy(true);
    setError('');
    try {
      await updateWarehouse(row.id, input);
      await onChanged(input.isDefault ? row.id : undefined);
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal className="wh-dialog wh-sites-dialog" title="المستودعات" onClose={onClose}>
      <div className="wh-sites">
        {error ? <p className="wh-error">{error}</p> : null}
        <form className="wh-site-add" onSubmit={addSite}>
          <Field label="مستودع جديد"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="اسم المستودع" />
          </Field>
          <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
            إضافة
          </Button>
        </form>
        <ul>
          {warehouses.map((row) => (
            <li key={row.id}>
              <div className="wh-site-name">
                <Input
                  value={drafts[row.id] ?? row.name}
                  maxLength={120}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                />
                <Button variant="secondary" type="button" disabled={busy || (drafts[row.id] ?? row.name).trim() === row.name} onClick={() => void saveName(row)}>
                  حفظ الاسم
                </Button>
              </div>
              <div className="wh-site-meta">
                {row.isDefault ? <span className="wh-pill is-ok">افتراضي</span> : null}
                <span className={`wh-pill${row.status === 'INACTIVE' ? ' is-off' : ''}`}>{row.status === 'ACTIVE' ? 'نشط' : 'موقوف'}</span>
                <div className="wh-site-actions">
                  {!row.isDefault ? (
                    <Button variant="secondary" type="button" disabled={busy} onClick={() => void patch(row, { isDefault: true })}>
                      تعيين كافتراضي
                    </Button>
                  ) : null}
                  <Button variant="secondary"
                    type="button"
                    disabled={busy || (row.isDefault && row.status === 'ACTIVE')}
                    onClick={() => void patch(row, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                  >
                    {row.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function ProductPhoto({ id, stamp, hasImage, name }: { id: string; stamp: string; hasImage: boolean; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!hasImage) {
      setSrc(null);
      return;
    }
    let url = '';
    let dead = false;
    fetchProductImage(id).then((blob) => {
      if (dead || !blob) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, stamp, hasImage]);
  if (!src) return <span className="wh-ph">{(name || 'ص').slice(0, 1)}</span>;
  return <img src={src} alt="" />;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function ValueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l9 16H3L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h11M12 4l3 3-3 3M20 17H9M12 14l-3 3 3 3" />
    </svg>
  );
}
