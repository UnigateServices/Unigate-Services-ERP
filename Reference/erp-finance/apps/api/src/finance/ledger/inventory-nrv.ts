import { Prisma } from '@prisma/client';

const ZERO = new Prisma.Decimal(0);

function round4(value: Prisma.Decimal) {
  return new Prisma.Decimal(value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4));
}

/** IAS 2: the unit is written down only when net realizable value is below cost. */
export function unitWriteDown(cost: Prisma.Decimal, nrv: Prisma.Decimal) {
  const gap = cost.minus(nrv);
  return gap.gt(0) ? round4(gap) : ZERO;
}

/** Allowance for the quantity still held. Nothing is carried when the shelf is empty. */
export function targetAllowance(onHand: Prisma.Decimal, cost: Prisma.Decimal, nrv: Prisma.Decimal) {
  if (onHand.lte(0)) return ZERO;
  return round4(onHand.mul(unitWriteDown(cost, nrv)));
}

/**
 * Weighted-average release of the allowance pool when quantity leaves.
 * Capped at the pool and at the cost of the units sold, so cost of sales is the carrying amount.
 */
/**
 * Undo a receipt inside the weighted-average pool.
 * Returns null when the receipt empties the quantity that carried the average.
 */
export function rewoundUnitCost(
  onHand: Prisma.Decimal,
  unitCost: Prisma.Decimal | null,
  removeQty: Prisma.Decimal,
  removeValue: Prisma.Decimal,
) {
  if (unitCost == null || removeQty.lte(0)) return unitCost;
  const nextQty = onHand.minus(removeQty);
  if (nextQty.lte(0)) return null;
  const nextValue = onHand.mul(unitCost).minus(removeValue);
  if (nextValue.lte(0)) return ZERO;
  return round4(nextValue.div(nextQty));
}

export function releaseAllowance(
  allowance: Prisma.Decimal,
  onHandBefore: Prisma.Decimal,
  quantity: Prisma.Decimal,
  costOfQuantity: Prisma.Decimal,
) {
  if (allowance.lte(0) || onHandBefore.lte(0) || quantity.lte(0)) return ZERO;
  const share = round4(allowance.mul(quantity).div(onHandBefore));
  const capped = share.gt(allowance) ? allowance : share;
  return capped.gt(costOfQuantity) ? round4(costOfQuantity) : capped;
}
