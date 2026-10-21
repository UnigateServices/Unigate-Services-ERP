export type ScannableProduct = {
  id: string;
  sku: string;
  barcode: string;
  status?: string;
};

export type ScannedLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

export function normalizeScan(value: string) {
  return value.trim().replace(/\s+/g, '');
}

export function findScannedProduct<T extends ScannableProduct>(products: T[], raw: string) {
  const code = normalizeScan(raw).toLowerCase();
  if (!code) return null;
  const active = products.filter((product) => !product.status || product.status === 'ACTIVE');
  return (
    active.find((product) => product.barcode.toLowerCase() === code) ||
    active.find((product) => product.sku.toLowerCase() === code) ||
    null
  );
}

export function addScannedLine<T extends ScannedLine>(lines: T[], productId: string, unitPrice: string, blank: T) {
  const existing = lines.find((line) => line.productId === productId);
  if (existing) {
    const qty = Number(existing.quantity);
    const next = Number.isFinite(qty) ? qty + 1 : 1;
    return lines.map((line) => (line.key === existing.key ? { ...line, quantity: String(next) } : line));
  }
  const empty = lines.find((line) => !line.productId);
  if (empty) {
    return lines.map((line) =>
      line.key === empty.key ? { ...line, productId, unitPrice: unitPrice || line.unitPrice } : line,
    );
  }
  return [...lines, { ...blank, productId, unitPrice, quantity: '1' }];
}
