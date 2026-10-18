'use client';

import { OpsTable, OpsEmpty } from './ops-table';

import { OpsField, OpsInput, OpsTextarea } from './ops-field';

import { OpsButton } from './ops-button';

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
import { OpsCard } from './ops-card';
import { OpsDialog, OpsDialogFooter } from './ops-dialog';
import { OpsSelect } from './ops-select';
import { useOpsToasts } from './ops-toasts';

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
  const { push, node: toasts } = useOpsToasts();
  const [tab, setTab] = useState<TabId>('catalog');
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

  function chooseWarehouse(id: string) {
    setWarehouseId(id);
    setSheet(null);
    setError('');
  }

  return (
    <section className="ops-page wh">
      {toasts}
      <OpsCard
        title="المستودع"
        chip="المخزون"
        toolbar={
        <div className="wh-head-tools">
          <OpsField className="wh-pick" label="المستودع الحالي">
            <OpsSelect
              value={warehouseId || ''}
              options={warehouses.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              onChange={chooseWarehouse}
            />
          </OpsField>
          {site?.isDefault ? <span className="wh-chip">افتراضي</span> : null}
          {site && !siteOpen ? <span className="wh-chip is-off">موقوف</span> : null}
          {actor.role === 'GENERAL_MANAGER' ? (
            <OpsButton variant="secondary" type="button" onClick={() => setSheet({ kind: 'sites' })}>
              إدارة المستودعات
            </OpsButton>
          ) : null}
          {canManage ? (
            <OpsButton variant="primary" type="button" onClick={() => setSheet({ kind: 'product', id: null })}>
              صنف جديد
            </OpsButton>
          ) : null}
        </div>
        }
      >

      {site && !siteOpen ? (
        <p className="wh-banner">هذا المستودع موقوف. الأرصدة متاحة للعرض، والحركات الجديدة غير مقبولة.</p>
      ) : null}
      {error ? <p className="wh-error">{error}</p> : null}

      <div className="wh-kpis">
        <Kpi label="أصناف نشطة" value={String(kpis.products)} hint="ضمن كل المستودع" icon="box" />
        <Kpi label="قيمة المخزون بالتكلفة" value={formatMoney(kpis.stockValue)} hint="للأصناف النشطة المتوفرة" icon="value" />
        <Kpi
          label="تحت حد إعادة الطلب"
          value={String(kpis.low)}
          hint={kpis.low > 0 ? 'تحتاج متابعة' : 'لا أصناف تحت الحد'}
          icon="alert"
          tone={kpis.low > 0 ? 'warn' : 'ok'}
        />
        <Kpi label="حركات اليوم" value={String(kpis.movesToday)} hint="في هذا المستودع" icon="move" />
      </div>
      </OpsCard>

      <OpsCard title={tab === 'catalog' ? 'الأصناف' : 'سجل الحركات'} count={tab === 'catalog' ? visible.length : visibleJournal.length}>
      <div className="wh-panel">
        <div className="wh-toolbar">
          <div className="wh-tabs" role="tablist">
            <OpsButton variant="choice" className={tab === 'catalog' ? 'is-on' : ''} type="button" role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>
              الأصناف
            </OpsButton>
            <OpsButton variant="choice" className={tab === 'moves' ? 'is-on' : ''} type="button" role="tab" aria-selected={tab === 'moves'} onClick={() => setTab('moves')}>
              سجل الحركات
            </OpsButton>
          </div>
          {tab === 'catalog' ? (
            <OpsField className="wh-search" label="بحث"><SearchIcon />
              <OpsInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث أو مسح الباركود ثم Enter"
                aria-label="بحث في الأصناف"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
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
              />
            </OpsField>
          ) : (
            <OpsField className="wh-search" label="بحث"><SearchIcon />
              <OpsInput
                value={journalQuery}
                onChange={(event) => setJournalQuery(event.target.value)}
                placeholder="بحث بالمرجع أو الصنف أو الموظف"
                aria-label="بحث في الحركات"
              />
            </OpsField>
          )}
          {tab === 'catalog' ? (
            <OpsField className="wh-sort" label="الترتيب">
              <OpsSelect
                value={sort}
                options={[
                  { value: 'name', label: 'الاسم' },
                  { value: 'stock', label: 'الرصيد' },
                  { value: 'value', label: 'القيمة' },
                ]}
                onChange={(value) => setSort(value as SortId)}
              />
            </OpsField>
          ) : null}
        </div>

        {tab === 'catalog' ? (
          <div className="wh-filters" role="tablist" aria-label="تصفية الأصناف">
            {FILTERS.filter((item) => canManage || item.id !== 'inactive').map((item) => (
              <OpsButton variant="choice" className={filter === item.id ? 'is-on' : ''}
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <em>{counts[item.id]}</em>
              </OpsButton>
            ))}
            <span className="wh-count">{visible.length} صنفاً في هذا العرض</span>
          </div>
        ) : (
          <div className="wh-filters" aria-label="تصفية الحركات">
            {(
              [
                { id: 'ALL', label: 'الكل' },
                { id: 'IN', label: 'إدخال' },
                { id: 'OUT', label: 'إخراج' },
                { id: 'ADJUST', label: 'جرد' },
              ] as const
            ).map((item) => (
              <OpsButton variant="choice" className={journalType === item.id ? 'is-on' : ''}
                key={item.id}
                type="button"
                onClick={() => setJournalType(item.id)}
              >
                {item.label}
              </OpsButton>
            ))}
            <span className="wh-count">{visibleJournal.length} حركة</span>
          </div>
        )}

        {tab === 'catalog' ? (
          <CatalogTable
            rows={visible}
            ready={catalogReady}
            canMove={canMove && siteOpen}
            onOpen={(id) => setSheet({ kind: 'product', id })}
            onMove={(id) => setSheet({ kind: 'move', id })}
            onCreate={canManage ? () => setSheet({ kind: 'product', id: null }) : undefined}
            filtered={Boolean(debounced) || filter !== 'all'}
          />
        ) : (
          <JournalTable rows={visibleJournal} ready={journalReady} onOpen={(id) => setSheet({ kind: 'product', id })} />
        )}
      </div>
      </OpsCard>

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
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone = 'ok',
}: {
  label: string;
  value: string;
  hint: string;
  icon: 'box' | 'value' | 'alert' | 'move';
  tone?: 'ok' | 'warn';
}) {
  return (
    <article className={`wh-kpi${tone === 'warn' ? ' is-warn' : ''}`}>
      <span className={`wh-kpi-icon is-${icon}`} aria-hidden>
        {icon === 'box' ? <BoxIcon /> : null}
        {icon === 'value' ? <ValueIcon /> : null}
        {icon === 'alert' ? <AlertIcon /> : null}
        {icon === 'move' ? <MoveIcon /> : null}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  );
}

function CatalogTable({
  rows,
  ready,
  canMove,
  onOpen,
  onMove,
  onCreate,
  filtered,
}: {
  rows: ProductRow[];
  ready: boolean;
  canMove: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string) => void;
  onCreate?: () => void;
  filtered: boolean;
}) {
  if (!ready) return <OpsEmpty title="جاري تحميل الأصناف..." />;
  if (rows.length === 0) {
    return (
      <OpsEmpty
        title={filtered ? 'لا أصناف تطابق هذا العرض' : 'لا أصناف في المستودع بعد'}
        detail={filtered ? 'غيّر البحث أو التصفية لإظهار أصناف أخرى.' : 'أضف صنفاً ليظهر مع رصيده وتكلفته وحد إعادة الطلب.'}
      >
        {onCreate && !filtered ? (
          <OpsButton variant="primary" type="button" onClick={onCreate}>
            صنف جديد
          </OpsButton>
        ) : null}
      </OpsEmpty>
    );
  }

  return (
    <OpsTable>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الوحدة</th>
            <th className="num">الرصيد</th>
            <th className="num">حد الطلب</th>
            <th className="num">التكلفة</th>
            <th className="num">البيع</th>
            <th className="num">القيمة</th>
            <th>الحالة</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = stockTone(row);
            const value = lineValue(row);
            return (
              <tr key={row.id} onClick={() => onOpen(row.id)}>
                <td>
                  <div className="wh-identity">
                    <span className="wh-thumb">
                      <ProductPhoto id={row.id} stamp={row.updatedAt} hasImage={row.hasImage} name={row.name} />
                    </span>
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {row.sku}
                        {row.barcode ? ` · ${row.barcode}` : ''}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{unitLabel(row.unit)}</td>
                <td className={`num wh-qty is-${tone}`}>{formatQty(row.onHand)}</td>
                <td className="num">{formatQty(row.minQuantity)}</td>
                <td className="num">{formatMoney(row.costPrice)}</td>
                <td className="num">{formatMoney(row.salePrice)}</td>
                <td className="num">{value == null ? '—' : formatMoney(value)}</td>
                <td>
                  <span className={`wh-pill is-${tone}`}>{stockLabel(row)}</span>
                </td>
                <td className="wh-row-actions" onClick={(event) => event.stopPropagation()}>
                  <OpsButton variant="secondary" type="button" onClick={() => onOpen(row.id)}>
                    التفاصيل
                  </OpsButton>
                  {canMove && row.status === 'ACTIVE' ? (
                    <OpsButton variant="secondary" className="is-accent" type="button" onClick={() => onMove(row.id)}>
                      حركة
                    </OpsButton>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
    </OpsTable>
  );
}

function JournalTable({
  rows,
  ready,
  onOpen,
}: {
  rows: StockMoveRow[];
  ready: boolean;
  onOpen: (productId: string) => void;
}) {
  if (!ready) return <OpsEmpty title="جاري تحميل الحركات..." />;
  if (rows.length === 0) return <OpsEmpty title="لا حركات في هذا العرض" detail="تظهر هنا عمليات الإدخال والإخراج والجرد." />;
  return (
    <OpsTable>
        <thead>
          <tr>
            <th>المرجع</th>
            <th>الصنف</th>
            <th>الحركة</th>
            <th className="num">الكمية</th>
            <th>الموظف</th>
            <th>الوقت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => onOpen(row.productId)}>
              <td>
                <div className="wh-ref">
                  <strong>{row.reference}</strong>
                  {row.notes ? <small>{row.notes}</small> : null}
                </div>
              </td>
              <td>
                <div className="wh-ref">
                  <strong>{row.productName}</strong>
                  <small>{row.sku}</small>
                </div>
              </td>
              <td>
                <span className={`wh-pill is-${row.moveType === 'IN' ? 'ok' : row.moveType === 'OUT' ? 'out' : 'low'}`}>
                  {moveLabel(row.moveType)}
                </span>
              </td>
              <td className={`num wh-qty is-${row.moveType === 'IN' ? 'ok' : row.moveType === 'OUT' ? 'out' : 'low'}`}>
                {row.moveType === 'OUT' ? '−' : row.moveType === 'IN' ? '+' : ''}
                {formatQty(row.quantity)} {unitLabel(row.unit)}
              </td>
              <td>{row.employeeName}</td>
              <td>{formatWhen(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
    </OpsTable>
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

  return (
    <>
      <OpsDialog
        wide
        className="wh-dialog wh-editor-dialog"
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
            <OpsDialogFooter
              formId="wh-product-form"
              onCancel={onClose}
              saveLabel={creating ? 'حفظ الصنف' : 'حفظ التعديل'}
              saving={busy}
            />
          ) : (
            <OpsButton variant="secondary" className="ops-dialog-btn is-secondary" type="button" onClick={onClose}>
              إغلاق
            </OpsButton>
          )
        }
      >
        <div className="wh-editor">
          {error ? <p className="wh-error">{error}</p> : null}
          <aside className="wh-aside">
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
                  <OpsField label={hasImage || previewUrl ? 'تغيير الصورة' : 'رفع صورة'}><input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(event) => void onImage(event.target.files?.[0])}
                    />
                  </OpsField>
                  {hasImage || previewUrl ? (
                    <OpsButton variant="secondary" type="button" onClick={() => void clearImage()}>
                      إزالة
                    </OpsButton>
                  ) : null}
                </div>
              ) : null}
            </div>
            {shown ? (
              <div className="wh-balance">
                <span>الرصيد في {warehouseName || 'المستودع'}</span>
                <strong className={`is-${tone}`}>
                  {formatQty(shown.onHand)} <small>{unitLabel(shown.unit)}</small>
                </strong>
                <em>{stockLabel(shown)} · الحد {formatQty(shown.minQuantity)}</em>
                {canMove && shown.status === 'ACTIVE' ? (
                  <OpsButton variant="primary" type="button" onClick={() => onOpenMove(shown.id)}>
                    تسجيل حركة
                  </OpsButton>
                ) : null}
              </div>
            ) : null}
          </aside>

          {canManage ? (
            <form id="wh-product-form" className="wh-form" onSubmit={saveProduct}>
              <h3>بيانات الصنف</h3>
              <OpsField className="is-wide" label="الاسم"><OpsInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={160} />
              </OpsField>
              <OpsField label="الرمز"><OpsInput value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="يُولَّد تلقائياً" maxLength={40} />
              </OpsField>
              <OpsField label="الباركود" hint="يُمسح في البيع والشراء وبحث المستودع. اتركه فارغاً إن لم يوجد."><OpsInput value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} maxLength={64} />
              </OpsField>
              <OpsField label="الوحدة"><OpsSelect
                  value={form.unit}
                  options={UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
                  onChange={(value) => setForm({ ...form, unit: value as ProductUnit })}
                />
              </OpsField>
              <OpsField label="الحالة"><OpsSelect
                  value={form.status}
                  options={[
                    { value: 'ACTIVE', label: 'نشط' },
                    { value: 'INACTIVE', label: 'موقوف' },
                  ]}
                  onChange={(value) => setForm({ ...form, status: value as RecordStatus })}
                />
              </OpsField>
              <h3 className="is-wide">التسعير والحد</h3>
              <OpsField label="تكلفة الوحدة"><OpsInput inputMode="decimal" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} />
              </OpsField>
              <OpsField label="سعر البيع"><OpsInput inputMode="decimal" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} />
              </OpsField>
              <OpsField className="is-wide" label="حد إعادة الطلب" hint="إذا نزل الرصيد إلى هذا العدد أو دونه تظهر الحالة «تحت الحد»."><OpsInput inputMode="decimal" value={form.minQuantity} onChange={(event) => setForm({ ...form, minQuantity: event.target.value })} />
              </OpsField>
              <OpsField className="is-wide" label="ملاحظات"><OpsTextarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={1000} rows={3} />
              </OpsField>
              {!creating ? (
                <OpsButton variant="danger" className="is-wide" type="button" onClick={() => setConfirm(true)}>
                  إيقاف الصنف أو حذفه
                </OpsButton>
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
      </OpsDialog>
      {confirm ? (
        <OpsDialog
          danger
          className="wh-dialog"
          title="إيقاف أو حذف الصنف"
          onClose={() => setConfirm(false)}
          footer={
            <OpsDialogFooter
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
        </OpsDialog>
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
    if (needsRate && !(Number(fxRate) > 0)) {
      setError(masterErrorMessage(new ApiError('FX_RATE_REQUIRED', 'FX_RATE_REQUIRED')));
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
        fxRate: needsRate ? Number(fxRate) : undefined,
      });
      await onPosted();
    } catch (err) {
      setError(masterErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OpsDialog
      className="wh-dialog wh-move-dialog"
      title="تسجيل حركة"
      onClose={onClose}
      footer={
        <OpsDialogFooter
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
          <OpsButton variant="choice" className={moveType === 'IN' ? 'is-on' : ''} type="button" onClick={() => setMoveType('IN')}>
            <strong>إدخال</strong>
            <span>إضافة كمية إلى الرصيد</span>
          </OpsButton>
          <OpsButton variant="choice" className={moveType === 'OUT' ? 'is-on' : ''} type="button" onClick={() => setMoveType('OUT')}>
            <strong>إخراج</strong>
            <span>صرف كمية من الرصيد</span>
          </OpsButton>
          {canAdjust ? (
            <OpsButton variant="choice" className={moveType === 'ADJUST' ? 'is-on' : ''} type="button" onClick={() => setMoveType('ADJUST')}>
              <strong>جرد</strong>
              <span>تثبيت الرصيد على الكمية المعدودة</span>
            </OpsButton>
          ) : null}
        </div>
        <OpsField label={moveType === 'ADJUST' ? 'الكمية المعدودة' : 'الكمية'}><OpsInput inputMode="decimal" value={qty} onChange={(event) => setQty(event.target.value)} required autoFocus />
        </OpsField>
        {needsRate ? (
          <OpsField label="سعر الصرف">
            <OpsInput inputMode="decimal" value={fxRate} placeholder="ل.س / دولار" onChange={(event) => setFxRate(event.target.value)} />
          </OpsField>
        ) : null}
        <OpsField label="ملاحظة"><OpsInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="سبب الحركة، اختياري" />
        </OpsField>
        <p className="ops-note">تُرحَّل الحركة إلى حساب المخزون بتكلفة الصنف الحالية. الزيادة فائض والنقص عجز.</p>
        <div className={`wh-preview${blocked ? ' is-bad' : ''}`}>
          <span>الرصيد بعد الحركة</span>
          <strong>{next == null ? '—' : formatQty(next)} {unitLabel(product?.unit)}</strong>
          {moveType === 'ADJUST' && next != null && next === onHand ? <em>الكمية المعدودة مطابقة للرصيد الحالي.</em> : null}
          {next != null && next < 0 ? <em>لا يمكن أن يصبح الرصيد سالباً.</em> : null}
        </div>
      </form>
    </OpsDialog>
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
    <OpsDialog className="wh-dialog wh-sites-dialog" title="المستودعات" onClose={onClose}>
      <div className="wh-sites">
        {error ? <p className="wh-error">{error}</p> : null}
        <form className="wh-site-add" onSubmit={addSite}>
          <OpsField label="مستودع جديد"><OpsInput value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="اسم المستودع" />
          </OpsField>
          <OpsButton variant="primary" type="submit" disabled={busy || !name.trim()}>
            إضافة
          </OpsButton>
        </form>
        <ul>
          {warehouses.map((row) => (
            <li key={row.id}>
              <div className="wh-site-name">
                <OpsInput
                  value={drafts[row.id] ?? row.name}
                  maxLength={120}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                />
                <OpsButton variant="secondary" type="button" disabled={busy || (drafts[row.id] ?? row.name).trim() === row.name} onClick={() => void saveName(row)}>
                  حفظ الاسم
                </OpsButton>
              </div>
              <div className="wh-site-meta">
                {row.isDefault ? <span className="wh-pill is-ok">افتراضي</span> : null}
                <span className={`wh-pill${row.status === 'INACTIVE' ? ' is-off' : ''}`}>{row.status === 'ACTIVE' ? 'نشط' : 'موقوف'}</span>
                <div className="wh-site-actions">
                  {!row.isDefault ? (
                    <OpsButton variant="secondary" type="button" disabled={busy} onClick={() => void patch(row, { isDefault: true })}>
                      تعيين كافتراضي
                    </OpsButton>
                  ) : null}
                  <OpsButton variant="secondary"
                    type="button"
                    disabled={busy || (row.isDefault && row.status === 'ACTIVE')}
                    onClick={() => void patch(row, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                  >
                    {row.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                  </OpsButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </OpsDialog>
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
