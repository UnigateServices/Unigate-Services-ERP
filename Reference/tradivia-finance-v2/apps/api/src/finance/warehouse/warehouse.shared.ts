import { ConflictException } from '@nestjs/common';
import { Prisma, Product, ProductUnit, RecordStatus, StockMoveType } from '@prisma/client';

export function money(value: Prisma.Decimal | null | undefined) {
  if (value == null) return null;
  return value.toFixed(4).replace(/\.?0+$/, '') || '0';
}

export function qty(value: Prisma.Decimal | null | undefined) {
  return money(value ?? new Prisma.Decimal(0)) || '0';
}

export function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function cleanSku(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function cleanBarcode(value: string | undefined) {
  return (value || '').trim().replace(/\s+/g, '');
}

export function decimalOrNull(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return new Prisma.Decimal(value.toFixed(4));
}

export function productView(
  row: Product,
  onHand: Prisma.Decimal,
) {
  const min = row.minQuantity;
  const low = row.status === RecordStatus.ACTIVE && min.gt(0) && onHand.lte(min);
  const out = onHand.lte(0);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    unit: row.unit,
    costPrice: money(row.costPrice),
    salePrice: money(row.salePrice),
    minQuantity: qty(row.minQuantity),
    notes: row.notes,
    status: row.status,
    hasImage: Boolean(row.imagePath),
    updatedAt: row.updatedAt.toISOString(),
    onHand: qty(onHand),
    low,
    out,
  };
}

export function startOfToday() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

export function nextStockReference(serial: number, when = new Date()) {
  const y = String(when.getFullYear()).slice(2);
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `ST-${y}${m}${d}-${String(serial).padStart(3, '0')}`;
}

export function assertUnique(existing: { id: string } | null, code: string, selfId?: string) {
  if (existing && existing.id !== selfId) {
    throw new ConflictException(code);
  }
}

export const UNIT_VALUES = Object.values(ProductUnit);
export const MOVE_VALUES = Object.values(StockMoveType);
