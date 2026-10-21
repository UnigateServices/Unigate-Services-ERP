'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AuthUser,
  CustomerRow,
  IncomeRow,
  OutcomeRow,
  PurchaseInvoiceSummary,
  SalesInvoiceSummary,
  SupplierRow,
  listCustomers,
  listIncomes,
  listOutcomes,
  listPurchaseInvoices,
  listSalesInvoices,
  listSuppliers,
} from '../lib/api';
import { modulesForRole } from '../lib/modules';
import { PALETTE_OPEN_EVENT, requestPaletteOpen } from '../lib/palette-open';
import './enterprise.css';

type Catalog = {
  customers: CustomerRow[];
  suppliers: SupplierRow[];
  sales: SalesInvoiceSummary[];
  purchases: PurchaseInvoiceSummary[];
  incomes: IncomeRow[];
  outcomes: OutcomeRow[];
};

type Hit = {
  key: string;
  group: string;
  title: string;
  hint: string;
  run: () => void;
};

const GROUP_ORDER = ['الأقسام', 'المستندات', 'الأطراف'];

function includes(query: string, value: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function money(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function CommandPalette({ actor }: { actor: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyK') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen((value) => !value);
    }
    function onAsk() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(PALETTE_OPEN_EVENT, onAsk);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(PALETTE_OPEN_EVENT, onAsk);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    let cancelled = false;
    setLoading(!catalog);
    Promise.all([
      listCustomers(),
      listSuppliers(),
      listSalesInvoices(),
      listPurchaseInvoices(),
      listIncomes(),
      listOutcomes(),
    ])
      .then(([customers, suppliers, sales, purchases, incomes, outcomes]) => {
        if (cancelled) return;
        setCatalog({ customers, suppliers, sales, purchases, incomes, outcomes });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
    // catalog is a cache; refresh whenever the palette opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hits = useMemo(() => buildHits(actor, catalog, query, () => setOpen(false)), [actor, catalog, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const node = document.querySelector<HTMLElement>(`[data-cmdk-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(index: number) {
    hits[index]?.run();
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (hits.length === 0 ? 0 : (index + 1) % hits.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (hits.length === 0 ? 0 : (index - 1 + hits.length) % hits.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  if (!open) return null;

  let cursor = 0;

  return (
    <div className="cmdk-root" role="presentation">
      <button type="button" className="cmdk-backdrop" aria-label="إغلاق البحث" onClick={() => setOpen(false)} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="بحث سريع" onKeyDown={onKeyDown}>
        <div className="cmdk-search">
          <input
            ref={inputRef}
            value={query}
            placeholder="ابحث في الأقسام والفواتير والسندات والزبائن..."
            aria-label="بحث سريع"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Ctrl K</kbd>
        </div>
        <div className="cmdk-list" role="listbox">
          {loading && !catalog ? <p className="cmdk-empty">جارٍ تحميل السجلات...</p> : null}
          {!loading && hits.length === 0 ? <p className="cmdk-empty">لا نتائج مطابقة.</p> : null}
          {GROUP_ORDER.map((group) => {
            const rows = hits.filter((hit) => hit.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group}>
                <h3>{group}</h3>
                {rows.map((hit) => {
                  const index = cursor;
                  cursor += 1;
                  return (
                    <button
                      key={hit.key}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-cmdk-index={index}
                      className={index === active ? 'is-active' : ''}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(index)}
                    >
                      <strong>{hit.title}</strong>
                      <span>{hit.hint}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildHits(actor: AuthUser, catalog: Catalog | null, query: string, close: () => void): Hit[] {
  const needle = query.trim();
  const hits: Hit[] = [];
  const navLimit = needle ? 8 : 12;
  let navCount = 0;
  for (const module of modulesForRole(actor.role)) {
    for (const group of module.groups) {
      for (const item of group.items) {
        if (item.hidden) continue;
        const entries = item.menu?.length ? item.menu : [{ id: item.id, label: item.label }];
        for (const entry of entries) {
          if (navCount >= navLimit) break;
          const blob = `${module.title} ${group.title} ${item.label} ${entry.label}`;
          if (needle && !includes(needle, blob)) continue;
          navCount += 1;
          hits.push({
            key: `nav-${module.id}-${entry.id}`,
            group: 'الأقسام',
            title: entry.label,
            hint: module.title,
            run: () => {
              close();
              const hash = `#${module.id}/${entry.id}`;
              if (window.location.hash !== hash) window.location.hash = hash;
            },
          });
        }
      }
    }
  }

  if (!catalog || !needle) return hits;

  let salesDocs = 0;
  for (const row of catalog.sales) {
    if (salesDocs >= 6) break;
    const blob = `${row.number} ${row.reference} ${row.customerName}`;
    if (!includes(needle, blob)) continue;
    salesDocs += 1;
    hits.push({
      key: `sales-${row.id}`,
      group: 'المستندات',
      title: `فاتورة بيع ${row.number}`,
      hint: `${row.customerName} · ${row.transactionDate} · ${money(row.total)} ${row.currency}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'sales', id: row.id });
      },
    });
  }
  let purchaseDocs = 0;
  for (const row of catalog.purchases) {
    if (purchaseDocs >= 6) break;
    const blob = `${row.number} ${row.reference} ${row.supplierName}`;
    if (!includes(needle, blob)) continue;
    purchaseDocs += 1;
    hits.push({
      key: `purchase-${row.id}`,
      group: 'المستندات',
      title: `فاتورة شراء ${row.number}`,
      hint: `${row.supplierName} · ${row.transactionDate} · ${money(row.total)} ${row.currency}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'purchase', id: row.id });
      },
    });
  }
  let incomeDocs = 0;
  for (const row of catalog.incomes) {
    if (incomeDocs >= 6) break;
    const blob = `${row.operationNumber} ${row.reference} ${row.sender} ${row.receiver} ${row.description}`;
    if (!includes(needle, blob)) continue;
    incomeDocs += 1;
    hits.push({
      key: `income-${row.id}`,
      group: 'المستندات',
      title: `سند قبض ${row.operationNumber}`,
      hint: `${row.reference} · ${money(row.total)} ${row.currency}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'voucher', sourceType: 'INCOME', sourceId: row.id });
      },
    });
  }
  let outcomeDocs = 0;
  for (const row of catalog.outcomes) {
    if (outcomeDocs >= 6) break;
    const blob = `${row.operationNumber} ${row.reference} ${row.deliverer} ${row.receiver} ${row.description}`;
    if (!includes(needle, blob)) continue;
    outcomeDocs += 1;
    hits.push({
      key: `outcome-${row.id}`,
      group: 'المستندات',
      title: `سند صرف ${row.operationNumber}`,
      hint: `${row.reference} · ${money(row.total)} ${row.currency}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'voucher', sourceType: 'OUTCOME', sourceId: row.id });
      },
    });
  }

  let customers = 0;
  for (const row of catalog.customers) {
    if (customers >= 6) break;
    const blob = `${row.name} ${row.phone} ${row.city} ${row.taxNumber}`;
    if (!includes(needle, blob)) continue;
    customers += 1;
    hits.push({
      key: `customer-${row.id}`,
      group: 'الأطراف',
      title: row.name,
      hint: `زبون${row.phone ? ` · ${row.phone}` : ''}${row.city ? ` · ${row.city}` : ''}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'customer', id: row.id });
      },
    });
  }
  let suppliers = 0;
  for (const row of catalog.suppliers) {
    if (suppliers >= 6) break;
    const blob = `${row.name} ${row.phone} ${row.address}`;
    if (!includes(needle, blob)) continue;
    suppliers += 1;
    hits.push({
      key: `supplier-${row.id}`,
      group: 'الأطراف',
      title: row.name,
      hint: `مورد${row.phone ? ` · ${row.phone}` : ''}`,
      run: () => {
        close();
        requestPaletteOpen({ kind: 'supplier', id: row.id });
      },
    });
  }

  return hits;
}
