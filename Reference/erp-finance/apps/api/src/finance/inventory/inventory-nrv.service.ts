import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency, Prisma, RecordStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { foreignOperationRate } from '../ledger/fx-journal';
import { targetAllowance } from '../ledger/inventory-nrv';
import { postOperationJournal } from '../ledger/post-source';
import { AssessInventoryDto } from './dto/assess-inventory.dto';

const ZERO = new Prisma.Decimal(0);

function money(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : value.toString();
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

@Injectable()
export class InventoryNrvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async preview() {
    const products = await this.prisma.product.findMany({
      where: { companyId: this.companyId, status: RecordStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
    const rows = [];
    for (const product of products) {
      const onHand = await companyOnHand(this.prisma as Prisma.TransactionClient, this.companyId, product.id);
      if (onHand.lte(0) && product.inventoryAllowance.lte(0) && product.unitNrv == null) continue;
      const cost = product.costPrice ?? ZERO;
      const nrv = product.unitNrv ?? product.salePrice;
      rows.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        onHand: onHand.toString(),
        costPrice: money(product.costPrice),
        salePrice: money(product.salePrice),
        unitNrv: money(product.unitNrv),
        suggestedNrv: money(nrv),
        allowance: product.inventoryAllowance.toString(),
        nrvCurrency: product.nrvCurrency,
        carrying: onHand.gt(0) ? onHand.mul(cost).minus(product.inventoryAllowance).toString() : '0',
      });
    }
    return rows;
  }

  async assess(actor: AuthUser, dto: AssessInventoryDto) {
    const fxRate = await foreignOperationRate(
      this.prisma as Prisma.TransactionClient,
      this.companyId,
      dto.currency as Currency,
      undefined,
      { date: parseDateOnly(dto.transactionDate) },
    );
    const ids = [...new Set(dto.lines.map((line) => line.productId))].sort();
    if (ids.length !== dto.lines.length) throw new BadRequestException('LINES_REQUIRED');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
      const products = await tx.product.findMany({
        where: { id: { in: ids }, companyId: this.companyId, status: RecordStatus.ACTIVE },
      });
      if (products.length !== ids.length) throw new BadRequestException('PRODUCT_INACTIVE');
      const byId = new Map(products.map((product) => [product.id, product]));

      for (const product of products) {
        if (product.inventoryAllowance.gt(0) && product.nrvCurrency && product.nrvCurrency !== dto.currency) {
          throw new BadRequestException('NRV_CURRENCY');
        }
      }

      let writeDown = ZERO;
      let reversal = ZERO;
      const prepared = [];
      for (const line of dto.lines) {
        const product = byId.get(line.productId)!;
        const onHand = await companyOnHand(tx, this.companyId, product.id);
        const cost = product.costPrice ?? ZERO;
        const nrv = new Prisma.Decimal(line.unitNrv.toFixed(4));
        const after = targetAllowance(onHand, cost, nrv);
        const delta = after.minus(product.inventoryAllowance);
        if (delta.gt(0)) writeDown = writeDown.plus(delta);
        if (delta.lt(0)) reversal = reversal.plus(delta.abs());
        prepared.push({ product, onHand, cost, nrv, before: product.inventoryAllowance, after, delta });
      }

      const count = await tx.inventoryAssessment.count({ where: { companyId: this.companyId } });
      const reference = nextReference(count + 1);
      const assessment = await tx.inventoryAssessment.create({
        data: {
          companyId: this.companyId,
          reference,
          transactionDate: parseDateOnly(dto.transactionDate),
          currency: dto.currency as Currency,
          fxRate,
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId: actor.locationId,
          lines: {
            create: prepared.map((row) => ({
              productId: row.product.id,
              quantity: row.onHand,
              unitCost: row.cost,
              unitNrv: row.nrv,
              allowanceBefore: row.before,
              allowanceAfter: row.after,
            })),
          },
        },
        include: { lines: true },
      });

      for (const row of prepared) {
        await tx.product.update({
          where: { id: row.product.id },
          data: {
            unitNrv: row.nrv,
            nrvCurrency: dto.currency as Currency,
            inventoryAllowance: row.after,
          },
        });
      }

      const journal = allowanceJournal(writeDown, reversal, dto.currency as Currency, fxRate);
      if (journal.length) {
        await postOperationJournal(tx, {
          companyId: this.companyId,
          actorId: actor.id,
          locationId: actor.locationId,
          transactionDate: assessment.transactionDate,
          description: `قياس مخزون ${reference}`,
          sourceType: 'NRV',
          sourceId: assessment.id,
          lines: journal,
        });
      }

      return {
        id: assessment.id,
        reference: assessment.reference,
        currency: assessment.currency,
        fxRate: money(assessment.fxRate),
        writeDown: writeDown.toString(),
        reversal: reversal.toString(),
        lines: assessment.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toString(),
          unitCost: line.unitCost.toString(),
          unitNrv: line.unitNrv.toString(),
          allowanceBefore: line.allowanceBefore.toString(),
          allowanceAfter: line.allowanceAfter.toString(),
        })),
      };
    });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

export async function companyOnHand(db: Prisma.TransactionClient, companyId: string, productId: string) {
  const agg = await db.stockMovement.aggregate({
    where: { companyId, productId },
    _sum: { quantity: true },
  });
  return new Prisma.Decimal(agg._sum.quantity ?? 0);
}

function allowanceJournal(
  writeDown: Prisma.Decimal,
  reversal: Prisma.Decimal,
  currency: Currency,
  fxRate: Prisma.Decimal | null,
) {
  const lines: { code: string; currency: Currency; debit: Prisma.Decimal; credit: Prisma.Decimal; fxRate: Prisma.Decimal | null }[] = [];
  if (writeDown.gt(0)) {
    lines.push({ code: '5400', currency, debit: writeDown, credit: ZERO, fxRate });
    lines.push({ code: '1410', currency, debit: ZERO, credit: writeDown, fxRate });
  }
  if (reversal.gt(0)) {
    lines.push({ code: '1410', currency, debit: reversal, credit: ZERO, fxRate });
    lines.push({ code: '5400', currency, debit: ZERO, credit: reversal, fxRate });
  }
  return lines;
}

function nextReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `NRV-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
