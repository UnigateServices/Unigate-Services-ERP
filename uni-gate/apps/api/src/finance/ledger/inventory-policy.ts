import { Prisma } from '@prisma/client';

export const WEIGHTED_AVERAGE = 'WAC';

export type InventoryMode = 'PERPETUAL' | 'PERIODIC';

export function normalizeInventoryMethod(method: string | null | undefined): InventoryMode {
  return method === 'PERIODIC' ? 'PERIODIC' : 'PERPETUAL';
}

export async function inventoryMode(tx: Prisma.TransactionClient, companyId: string): Promise<InventoryMode> {
  const policy = await tx.accountingPolicy.findUnique({
    where: { companyId },
    select: { inventoryMethod: true },
  });
  return normalizeInventoryMethod(policy?.inventoryMethod);
}

export async function lockInventoryMethod(tx: Prisma.TransactionClient, companyId: string) {
  const existing = await tx.accountingPolicy.findUnique({ where: { companyId }, select: { inventoryLocked: true } });
  if (!existing) {
    await tx.accountingPolicy.create({
      data: { companyId, inventoryMethod: WEIGHTED_AVERAGE, inventoryLocked: true },
    });
    return;
  }
  if (!existing.inventoryLocked) {
    await tx.accountingPolicy.update({ where: { companyId }, data: { inventoryLocked: true } });
  }
}
