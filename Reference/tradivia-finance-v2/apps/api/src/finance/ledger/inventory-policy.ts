import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const WEIGHTED_AVERAGE = 'WAC';

/** Purchases and sales cost of goods use the company inventory policy. Only weighted average is implemented. */
export async function assertWeightedAverage(tx: Prisma.TransactionClient, companyId: string) {
  const policy = await tx.accountingPolicy.findUnique({
    where: { companyId },
    select: { inventoryMethod: true },
  });
  if ((policy?.inventoryMethod ?? WEIGHTED_AVERAGE) !== WEIGHTED_AVERAGE) {
    throw new BadRequestException('INVENTORY_METHOD');
  }
}
