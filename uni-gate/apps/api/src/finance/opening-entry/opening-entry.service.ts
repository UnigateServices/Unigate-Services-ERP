import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  Currency,
  OpenItemKind,
  OpenItemParty,
  Prisma,
  RecordStatus,
  SettlementMode,
  StockMoveType,
  StockSourceType,
} from '@prisma/client';
import { actorId, isFinanceAdmin, type FinanceActor } from '../finance-access';
import { personName } from '../people';
import { PrismaService } from '../../prisma/prisma.service';
import { functionalCurrency, foreignOperationRate } from '../ledger/fx-journal';
import { inventoryMode, lockInventoryMethod } from '../ledger/inventory-policy';
import { postOperationJournal } from '../ledger/post-source';
import { controlTotals, insertOpenItem, nearMoney, openingControlLines } from '../open-items/open-item-book';
import { PostOpeningDto } from './dto/opening-entry.dto';

/**
 * Control accounts with their own sub-ledger or fund book. Cash (1110, 1120, 1130) is opened per fund through
 * opening balances, and borrower custody (1300) is opened as sub-ledger items, so a free-form line can never
 * drift away from the book that explains it.
 */
const BLOCKED = new Set([
  '1110', '1120', '1130', '1200', '1210', '1250', '1300', '1400', '2100', '2150', '3300', '4100', '5000', '5100',
]);
const ZERO = new Prisma.Decimal(0);

@Injectable()
export class OpeningEntryService {
  constructor(private readonly prisma: PrismaService) {}

  async current(actor: FinanceActor) {
    const companyId = actor.companyId;
    const row = await this.prisma.openingEntry.findUnique({
      where: { companyId },
      include: { accounts: true, stock: true, employee: personName },
    });
    const policy = await this.prisma.accountingPolicy.findUnique({ where: { companyId } });
    if (!row) return { posted: false, functionalLocked: Boolean(policy?.functionalLocked), openingLocked: Boolean(policy?.openingLocked) };
    return {
      posted: Boolean(row.postedAt),
      balanceDate: iso(row.balanceDate),
      entryDate: iso(row.entryDate),
      allowance: money(row.allowance),
      reference: row.reference,
      employeeName: row.employee.user.name,
      functionalLocked: Boolean(policy?.functionalLocked),
      openingLocked: Boolean(policy?.openingLocked),
    };
  }

  preview(actor: FinanceActor, dto: PostOpeningDto) {
    this.assertManager(actor);
    return this.prisma.$transaction((tx) => this.compose(tx, actor, dto));
  }

  async post(actor: FinanceActor, dto: PostOpeningDto) {
    this.assertManager(actor);
    const companyId = actor.companyId;
    const memberId = actorId(actor);
    const existing = await this.prisma.openingEntry.findUnique({ where: { companyId } });
    if (existing?.postedAt) throw new BadRequestException('OPENING_LOCKED');
    return this.prisma.$transaction(async (tx) => {
      const draft = await this.compose(tx, actor, dto);
      const entry = existing
        ? await tx.openingEntry.update({
            where: { companyId_id: { companyId, id: existing.id } },
            data: {
              balanceDate: parseDate(dto.balanceDate),
              entryDate: parseDate(dto.entryDate),
              allowance: new Prisma.Decimal(dto.allowance),
              employeeId: memberId,
              postedAt: new Date(),
              reference: '',
            },
          })
        : await tx.openingEntry.create({
            data: {
              companyId,
              balanceDate: parseDate(dto.balanceDate),
              entryDate: parseDate(dto.entryDate),
              allowance: new Prisma.Decimal(dto.allowance),
              employeeId: memberId,
              postedAt: new Date(),
            },
          });
      await tx.openingAccountLine.deleteMany({ where: { companyId, entryId: entry.id } });
      await tx.openingStockLine.deleteMany({ where: { companyId, entryId: entry.id } });
      if (dto.accounts.length) {
        await tx.openingAccountLine.createMany({
          data: dto.accounts.map((line, index) => ({
            companyId,
            entryId: entry.id,
            code: line.code.trim(),
            currency: line.currency as Currency,
            debit: line.debit,
            credit: line.credit,
            memo: (line.memo || '').trim(),
            sortOrder: index,
          })),
        });
      }
      for (const line of dto.stock) {
        await tx.openingStockLine.create({
          data: {
            companyId,
            entryId: entry.id,
            productId: line.productId,
            warehouseId: line.warehouseId,
            quantity: line.quantity,
            unitCost: line.unitCost ?? 0,
          },
        });
      }
      const parties = await this.persistParties(tx, companyId, dto);
      for (const item of parties) {
        await insertOpenItem(tx, {
          companyId,
          party: item.party,
          customerId: item.customerId,
          supplierId: item.supplierId,
          partyName: item.name,
          kind: item.kind,
          documentDate: item.documentDate,
          dueDate: item.dueDate,
          currency: item.currency,
          fxRate: item.fxRate,
          amount: item.amount,
          settlementMode: item.settlementMode,
          sourceType: 'OPENING',
          sourceId: entry.id,
          memo: item.memo,
        });
      }
      for (const item of await this.prepareCustody(tx, companyId, dto)) {
        let borrower = await tx.borrower.findFirst({ where: { companyId, name: item.borrowerName } });
        if (!borrower) borrower = await tx.borrower.create({ data: { companyId, name: item.borrowerName } });
        await insertOpenItem(tx, {
          companyId,
          party: OpenItemParty.BORROWER,
          borrowerId: borrower.id,
          partyName: item.borrowerName,
          kind: OpenItemKind.CUSTODY,
          documentDate: item.documentDate,
          currency: item.currency,
          fxRate: item.fxRate,
          amount: item.amount,
          settlementMode: SettlementMode.CASH,
          sourceType: 'OPENING',
          sourceId: entry.id,
          memo: item.memo,
        });
      }
      const mode = await inventoryMode(tx, companyId);
      for (const [index, line] of dto.stock.entries()) {
        const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
        if (!product) throw new BadRequestException('PRODUCT_NOT_FOUND');
        const onHand = await tx.stockMovement.aggregate({
          where: { companyId, productId: line.productId },
          _sum: { quantity: true },
        });
        const held = new Prisma.Decimal(onHand._sum.quantity ?? 0);
        if (mode === 'PERPETUAL') {
          const unit = new Prisma.Decimal(line.unitCost ?? 0);
          const nextQty = held.plus(line.quantity);
          const blended = held.eq(0) || !product.costPrice
            ? unit
            : held.mul(product.costPrice).plus(unit.mul(line.quantity)).div(nextQty);
          await tx.product.update({ where: { companyId_id: { companyId, id: product.id } }, data: { costPrice: blended } });
        }
        await tx.stockMovement.create({
          data: {
            companyId,
            reference: `OB-${entry.id.slice(-6)}-${index + 1}`,
            productId: line.productId,
            warehouseId: line.warehouseId,
            moveType: StockMoveType.IN,
            quantity: line.quantity,
            notes: 'افتتاح مخزون',
            sourceType: StockSourceType.OPENING,
            sourceId: entry.id,
            employeeId: memberId,
          },
        });
      }
      if (dto.stock.length) await lockInventoryMethod(tx, companyId);
      await postOperationJournal(tx, {
        companyId,
        actorId: memberId,
        transactionDate: parseDate(dto.entryDate),
        description: `قيد افتتاحي ${dto.balanceDate}`,
        sourceType: 'OPENING_ENTRY',
        sourceId: entry.id,
        lines: draft.lines.map((line) => ({
          code: line.code,
          currency: line.currency as Currency,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
          fxRate: line.fxRate,
        })),
      });
      const policy = await tx.accountingPolicy.findUnique({ where: { companyId } });
      if (!policy) {
        await tx.accountingPolicy.create({
          data: { companyId, functionalLocked: true, openingLocked: true },
        });
      } else {
        await tx.accountingPolicy.update({
          where: { companyId },
          data: { functionalLocked: true, openingLocked: true },
        });
      }
      return { ...draft, posted: true, id: entry.id };
    });
  }

  private async compose(tx: Prisma.TransactionClient, actor: FinanceActor, dto: PostOpeningDto) {
    const companyId = actor.companyId;
    const functional = await functionalCurrency(tx, companyId);
    const mode = await inventoryMode(tx, companyId);
    const prepared = await this.prepareItems(tx, companyId, dto, isFinanceAdmin(actor));
    const totals = controlTotals(prepared.map((item) => ({ kind: item.kind, amount: item.amount })));
    const allowance = new Prisma.Decimal(dto.allowance);
    if (
      !nearMoney(totals.receivables, dto.controls.receivables) ||
      !nearMoney(totals.payables, dto.controls.payables) ||
      !nearMoney(totals.customerAdvances, dto.controls.customerAdvances) ||
      !nearMoney(totals.supplierAdvances, dto.controls.supplierAdvances) ||
      !nearMoney(allowance, dto.controls.allowance)
    ) {
      throw new BadRequestException('CONTROL_MISMATCH');
    }
    const lines = openingControlLines(prepared, allowance, functional);
    const custody = await this.prepareCustody(tx, companyId, dto);
    for (const item of custody) {
      lines.push({
        code: '1300',
        currency: item.currency,
        debit: item.amount,
        credit: ZERO,
        fxRate: item.fxRate,
        memo: item.memo,
      });
    }
    let inventory = ZERO;
    if (mode === 'PERPETUAL') {
      for (const line of dto.stock) {
        const unit = new Prisma.Decimal(line.unitCost ?? 0);
        if (unit.lte(0)) throw new BadRequestException('COST_REQUIRED');
        inventory = inventory.plus(unit.mul(line.quantity));
      }
    } else {
      inventory = new Prisma.Decimal(dto.inventoryAmount ?? 0);
    }
    if (inventory.gt(0)) {
      lines.push({
        code: '1400',
        currency: functional,
        debit: inventory,
        credit: ZERO,
        fxRate: null,
        memo: mode === 'PERIODIC' ? 'مخزون افتتاحي دوري' : 'مخزون افتتاحي',
      });
    }
    for (const account of dto.accounts) {
      const code = account.code.trim();
      if (BLOCKED.has(code)) throw new BadRequestException('CONTROL_ACCOUNT');
      const debit = new Prisma.Decimal(account.debit);
      const credit = new Prisma.Decimal(account.credit);
      if (debit.eq(0) && credit.eq(0)) throw new BadRequestException('AMOUNT_INVALID');
      if (debit.gt(0) && credit.gt(0)) throw new BadRequestException('AMOUNT_INVALID');
      const currency = account.currency as Currency;
      const fxRate = await foreignOperationRate(tx, companyId, currency, undefined, {
        date: parseDate(dto.entryDate),
        canOverride: true,
      });
      lines.push({
        code,
        currency,
        debit,
        credit,
        fxRate,
        memo: (account.memo || '').trim(),
      });
    }
    const byCurrency = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const line of lines) {
      const bucket = byCurrency.get(line.currency) ?? { debit: ZERO, credit: ZERO };
      bucket.debit = bucket.debit.plus(line.debit);
      bucket.credit = bucket.credit.plus(line.credit);
      byCurrency.set(line.currency, bucket);
    }
    for (const [currency, bucket] of byCurrency) {
      const gap = bucket.debit.minus(bucket.credit);
      if (gap.abs().lt('0.01')) continue;
      if (currency !== functional) throw new BadRequestException('OPENING_CURRENCY');
      lines.push({
        code: '3300',
        currency: functional,
        debit: gap.lt(0) ? gap.abs() : ZERO,
        credit: gap.gt(0) ? gap : ZERO,
        fxRate: null,
        memo: 'موازنة القيد الافتتاحي',
      });
    }
    return {
      posted: false,
      functional,
      inventoryMethod: mode,
      totals: {
        receivables: money(totals.receivables),
        payables: money(totals.payables),
        customerAdvances: money(totals.customerAdvances),
        supplierAdvances: money(totals.supplierAdvances),
        allowance: money(allowance),
        netReceivables: money(totals.receivables.minus(allowance)),
      },
      lines: lines.map((line) => ({
        code: line.code,
        currency: line.currency,
        debit: money(line.debit),
        credit: money(line.credit),
        memo: line.memo,
        fxRate: line.fxRate ? Number(line.fxRate) : null,
      })),
    };
  }

  private async prepareItems(tx: Prisma.TransactionClient, companyId: string, dto: PostOpeningDto, canOverride: boolean) {
    const rows = [];
    for (const item of dto.items) {
      const kind = item.kind as OpenItemKind;
      const party = item.party as OpenItemParty;
      if (kind === OpenItemKind.ADVANCE_OUT || (party === OpenItemParty.CUSTOMER && kind !== OpenItemKind.RECEIVABLE)) {
        throw new BadRequestException('OPEN_ITEM_KIND');
      }
      if (party === OpenItemParty.SUPPLIER && kind !== OpenItemKind.PAYABLE && kind !== OpenItemKind.ADVANCE_IN) {
        throw new BadRequestException('OPEN_ITEM_KIND');
      }
      const currency = item.currency as Currency;
      const documentDate = parseDate(item.documentDate);
      const fxRate = await foreignOperationRate(tx, companyId, currency, undefined, {
        date: parseDate(dto.entryDate),
        canOverride,
      });
      rows.push({
        party,
        kind,
        name: item.name.trim(),
        documentDate,
        dueDate: item.dueDate ? parseDate(item.dueDate) : documentDate,
        currency,
        fxRate,
        amount: new Prisma.Decimal(item.amount),
        settlementMode: item.settlementMode as SettlementMode,
        memo: (item.memo || item.name).trim(),
        customerId: null as string | null,
        supplierId: null as string | null,
      });
    }
    if (rows.some((row) => !row.name)) throw new BadRequestException('NAME_REQUIRED');
    return rows;
  }

  private async persistParties(tx: Prisma.TransactionClient, companyId: string, dto: PostOpeningDto) {
    const prepared = await this.prepareItems(tx, companyId, dto, true);
    for (const item of prepared) {
      if (item.party === OpenItemParty.CUSTOMER) {
        const found = await tx.customer.upsert({
          where: { companyId_name: { companyId, name: item.name } },
          update: {},
          create: { companyId, name: item.name },
        });
        item.customerId = found.id;
      } else {
        const found = await tx.supplier.upsert({
          where: { companyId_name: { companyId, name: item.name } },
          update: {},
          create: { companyId, name: item.name },
        });
        item.supplierId = found.id;
      }
    }
    return prepared;
  }

  /** Opening custody: borrower balances carried into the 1300 sub-ledger (never a free-form 1300 line). */
  private async prepareCustody(tx: Prisma.TransactionClient, companyId: string, dto: PostOpeningDto) {
    const rows = [];
    for (const item of dto.custody ?? []) {
      const borrowerName = item.borrowerName.trim();
      if (!borrowerName) throw new BadRequestException('NAME_REQUIRED');
      const currency = item.currency as Currency;
      const fxRate = await foreignOperationRate(tx, companyId, currency, undefined, {
        date: parseDate(dto.entryDate),
        canOverride: true,
      });
      rows.push({
        borrowerName,
        currency,
        fxRate,
        amount: new Prisma.Decimal(item.amount),
        documentDate: parseDate(item.documentDate || dto.balanceDate),
        memo: (item.memo || "عهدة افتتاحية - ${borrowerName}").trim(),
      });
    }
    return rows;
  }

  private assertManager(actor: FinanceActor) {
    if (!isFinanceAdmin(actor)) throw new ForbiddenException('ONLY_GENERAL_MANAGER');
  }
}

function money(value: Prisma.Decimal | number) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}
