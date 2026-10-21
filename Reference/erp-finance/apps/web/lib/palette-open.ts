export type PaletteOpen =
  | { kind: 'sales'; id: string }
  | { kind: 'purchase'; id: string }
  | { kind: 'customer'; id: string }
  | { kind: 'supplier'; id: string }
  | { kind: 'sales-draft'; customerId: string }
  | { kind: 'purchase-draft'; supplierId: string }
  | { kind: 'voucher'; sourceType: 'INCOME' | 'OUTCOME'; sourceId: string }
  | { kind: 'new-voucher'; form: 'receipt' | 'payment' };

const KEY = 'unigate.paletteOpen';
export const PALETTE_EVENT = 'unigate-palette-open';
export const PALETTE_OPEN_EVENT = 'unigate-open-palette';

const HASH: Record<PaletteOpen['kind'], string> = {
  sales: '#sales/sales',
  'sales-draft': '#sales/sales',
  purchase: '#purchases/purchases',
  'purchase-draft': '#purchases/purchases',
  customer: '#sales/customers',
  supplier: '#purchases/suppliers',
  voucher: '#treasury/cash',
  'new-voucher': '#treasury/cash',
};

export function peekPaletteOpen(): PaletteOpen | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaletteOpen;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function dropPaletteOpen() {
  sessionStorage.removeItem(KEY);
}

export function requestPaletteOpen(target: PaletteOpen) {
  sessionStorage.setItem(KEY, JSON.stringify(target));
  const hash = HASH[target.kind];
  if (window.location.hash !== hash) window.location.hash = hash;
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}
