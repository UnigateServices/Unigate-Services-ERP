'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProductRow, fetchProductImage } from '../lib/api';
import { Input } from './ui/field';

const UNITS: Record<string, string> = {
  PIECE: 'قطعة',
  KG: 'كغ',
  METER: 'متر',
  LITER: 'لتر',
  BOX: 'صندوق',
  SET: 'طقم',
};

type Props = {
  products: ProductRow[];
  price: 'sale' | 'cost';
  onPick: (product: ProductRow) => void;
  embedded?: boolean;
};

function amount(value: string | null) {
  if (!value) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function quantity(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function Thumb({ product }: { product: ProductRow }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!product.hasImage) {
      setSrc(null);
      return;
    }
    let url = '';
    let dead = false;
    fetchProductImage(product.id).then((blob) => {
      if (dead || !blob) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [product.id, product.hasImage, product.updatedAt]);

  if (!src) return <span className="product-pick-ph">{product.name.slice(0, 1)}</span>;
  return <img src={src} alt="" />;
}

export function ProductPicker({ products, price, onPick, embedded }: Props) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return embedded ? [] : products;
    return products.filter((product) =>
      `${product.name} ${product.sku} ${product.barcode}`.toLowerCase().includes(needle),
    );
  }, [embedded, products, query]);

  function choose(product: ProductRow) {
    onPick(product);
    if (embedded) setQuery('');
  }

  const list = (
    <div className="product-picker-list">
      {visible.map((product) => {
        const unit = UNITS[product.unit] || product.unit;
        const shown = price === 'sale' ? product.salePrice : product.costPrice;
        return (
          <button key={product.id} type="button" className={product.out ? 'product-pick is-out' : 'product-pick'} onClick={() => choose(product)}>
            <Thumb product={product} />
            <span>
              <strong>{product.name}</strong>
              <em>
                {amount(shown)} · {product.out ? 'نفد' : `${quantity(product.onHand)} ${unit}`}
              </em>
            </span>
          </button>
        );
      })}
      {visible.length === 0 && (embedded ? query.trim() : true) ? <p>لا أصناف مطابقة في هذا المستودع.</p> : null}
    </div>
  );

  if (embedded) {
    return (
      <>
        <Input
          value={query}
          placeholder="ابحث بالاسم أو الرمز"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.trim() ? list : null}
      </>
    );
  }

  return (
    <aside className="product-picker" aria-label="الأصناف">
      <strong>الأصناف</strong>
      <input
        value={query}
        placeholder="ابحث بالاسم أو الرمز"
        onChange={(event) => setQuery(event.target.value)}
      />
      {list}
    </aside>
  );
}
