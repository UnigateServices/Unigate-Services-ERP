import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Currency,
  FundType,
  Prisma,
  Product,
  RecordStatus,
  SalesInvoiceStatus,
  SalesPaymentStatus,
  StockMoveType,
  StockSourceType,
  TransactionStatus,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  canDirectlyChangeOperations,
  isGeneralManager,
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { requireDirectReason, writeDirectAudit } from '../audit/write-direct-audit';
import { fundAccount, postOperationJournal, reverseOperationJournal } from '../ledger/post-source';
import { assertWeightedAverage } from '../ledger/inventory-policy';
import { releaseAllowance, rewoundUnitCost } from '../ledger/inventory-nrv';
import { companyOnHand } from '../inventory/inventory-nrv.service';
import { foreignOperationRate, functionalCurrency } from '../ledger/fx-journal';
import {
  ListPurchaseQueryDto,
  PurchaseLineDto,
  PurchasePaymentDto,
  SavePurchaseInvoiceDto,
  SupplierDto,
} from './dto/purchase.dto';

const invoiceInclude = {
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      employee: { select: { name: true } },
      outcome: { select: { id: true, reference: true, fund: true, status: true, transactionDate: true } },
    },
  },
} as const;

type PreparedLine = {
  product: Product;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  sortOrder: number;
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  listSuppliers(actor: AuthUser) {
    return this.prisma.supplier.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === 'EMPLOYEE' || actor.role === 'MONITOR' ? { status: RecordStatus.ACTIVE } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: SupplierDto) {
    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('NAME_REQUIRED');
    const taken = await this.prisma.supplier.findUnique({
      where: { companyId_name: { companyId: this.companyId, name } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('SUPPLIER_EXISTS');
    return this.prisma.supplier.create({
      data: {
        companyId: this.companyId,
        name,
        phone: (dto.phone || '').trim(),
        address: (dto.address || '').trim(),
        notes: (dto.notes || '').trim(),
        status: dto.status === 'INACTIVE' ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      },
    });
  }

  async updateSupplier(id: string, dto: SupplierDto) {
    const current = await this.requireSupplier(id);
    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('NAME_REQUIRED');
    const taken = await this.prisma.supplier.findUnique({
      where: { companyId_name: { companyId: this.companyId, name } },
      select: { id: true },
    });
    if (taken && taken.id !== current.id) throw new ConflictException('SUPPLIER_EXISTS');
    return this.prisma.supplier.update({
      where: { id: current.id },
      data: {
        name,
        phone: (dto.phone || '').trim(),
        address: (dto.address || '').trim(),
        notes: (dto.notes || '').trim(),
        status: dto.status === 'INACTIVE' ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      },
    });
  }

  async removeSupplier(id: string) {
    const current = await this.requireSupplier(id);
    const used = await this.prisma.purchaseInvoice.count({ where: { supplierId: current.id } });
    if (used > 0) {
      await this.prisma.supplier.update({
        where: { id: current.id },
        data: { status: RecordStatus.INACTIVE },
      });
      return { deactivated: true, id: current.id };
    }
    await this.prisma.supplier.delete({ where: { id: current.id } });
    return { deactivated: false, id: current.id };
  }

  async list(actor: AuthUser, query: ListPurchaseQueryDto) {
    const q = (query.q || '').trim();
    const rows = await this.prisma.purchaseInvoice.findMany({
      where: {
        companyId: this.companyId,
        ...operationListWhere(actor),
        ...(query.status ? { status: query.status } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { supplierName: { contains: q, mode: 'insensitive' } },
                { warehouseName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
        payments: { where: { status: SalesPaymentStatus.POSTED }, select: { amount: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { number: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      number: displayNumber(row.number),
      reference: row.reference,
      transactionDate: dateOnly(row.transactionDate),
      supplierName: row.supplierName,
      warehouseName: row.warehouseName,
      currency: row.currency,
      total: money(row.total),
      paid: money(sumPaid(row.payments)),
      balance: money(row.total.minus(sumPaid(row.payments))),
      paymentState: paymentState(row.total, sumPaid(row.payments)),
      status: row.status,
      lineCount: row._count.lines,
      employeeName: row.employee.name,
      locationName: row.location?.name || '',
    }));
  }

  async get(actor: AuthUser, id: string) {
    return present(await this.findScoped(actor, id));
  }

  async create(actor: AuthUser, dto: SavePurchaseInvoiceDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const prepared = await this.prepare(dto);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx);
      const reference = await this.nextReference(tx);
      const row = await tx.purchaseInvoice.create({
        data: {
          companyId: this.companyId,
          number,
          reference,
          ...prepared.header,
          employeeId: actor.id,
          locationId,
          lines: { create: prepared.lines },
        },
        include: invoiceInclude,
      });
      return present(row);
    });
  }

  async update(actor: AuthUser, id: string, dto: SavePurchaseInvoiceDto) {
    const current = await this.findScoped(actor, id);
    this.assertDraftOwner(actor, current);
    const locationId = await this.resolveLocationId(actor, dto.locationId ?? current.locationId ?? undefined);
    const prepared = await this.prepare(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: current.id } });
      const row = await tx.purchaseInvoice.update({
        where: { id: current.id },
        data: {
          ...prepared.header,
          locationId,
          lines: { create: prepared.lines },
        },
        include: invoiceInclude,
      });
      return present(row);
    });
  }

  async remove(actor: AuthUser, id: string) {
    const current = await this.findScoped(actor, id);
    this.assertDraftOwner(actor, current);
    await this.prisma.purchaseInvoice.delete({ where: { id: current.id } });
    return { id: current.id };
  }

  async post(actor: AuthUser, id: string) {
    const current = await this.findScoped(actor, id);
    this.assertDraftOwner(actor, current);
    if (!current.lines.length) throw new BadRequestException('LINES_REQUIRED');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: current.warehouseId, companyId: this.companyId },
    });
    if (!warehouse || warehouse.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('WAREHOUSE_INACTIVE');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: current.supplierId, companyId: this.companyId },
    });
    if (!supplier || supplier.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('SUPPLIER_INACTIVE');
    }

    return this.prisma.$transaction(async (tx) => {
      const productIds = [...new Set(current.lines.map((line) => line.productId))].sort();
      await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`;
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, companyId: this.companyId },
      });
      if (products.some((product) => product.status !== RecordStatus.ACTIVE)) {
        throw new BadRequestException('PRODUCT_INACTIVE');
      }
      await assertWeightedAverage(tx, this.companyId);
      await this.applyAverageCost(tx, current.warehouseId, current.lines);
      for (const line of current.lines) {
        await tx.stockMovement.create({
          data: {
            companyId: this.companyId,
            reference: `${current.reference}-L${line.sortOrder + 1}`,
            productId: line.productId,
            warehouseId: current.warehouseId,
            moveType: StockMoveType.IN,
            quantity: line.quantity,
            notes: `فاتورة شراء ${displayNumber(current.number)}`,
            sourceType: StockSourceType.PURCHASE_RECEIPT,
            sourceId: current.id,
            sourceLineId: line.id,
            employeeId: actor.id,
          },
        });
      }
      const row = await tx.purchaseInvoice.update({
        where: { id: current.id },
        data: { status: SalesInvoiceStatus.POSTED, postedAt: new Date() },
        include: invoiceInclude,
      });
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        transactionDate: current.transactionDate,
        description: `فاتورة شراء ${displayNumber(current.number)}`,
        sourceType: 'PURCHASE',
        sourceId: current.id,
        lines: [
          { code: '1400', currency: current.currency, debit: current.total, credit: 0, fxRate: current.fxRate },
          { code: '2100', currency: current.currency, debit: 0, credit: current.total, fxRate: current.fxRate },
        ],
      });
      return present(row);
    });
  }

  async voidInvoice(actor: AuthUser, id: string, reason: string) {
    if (!canDirectlyChangeOperations(actor)) throw new ForbiddenException('FORBIDDEN');
    const auditReason = requireDirectReason(reason);
    const current = await this.findScoped(actor, id);
    if (current.status !== SalesInvoiceStatus.POSTED) throw new BadRequestException('NOT_POSTED');
    if (current.payments.some((payment) => payment.status === SalesPaymentStatus.POSTED)) {
      throw new BadRequestException('PAYMENTS_OPEN');
    }

    return this.prisma.$transaction(async (tx) => {
      const productIds = [...new Set(current.lines.map((line) => line.productId))].sort();
      if (productIds.length) {
        await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`;
      }
      const need = new Map<string, Prisma.Decimal>();
      for (const line of current.lines) {
        need.set(line.productId, (need.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      }
      for (const [productId, quantity] of need) {
        const onHand = await this.onHand(tx, productId, current.warehouseId);
        if (onHand.lt(quantity)) throw new BadRequestException('INSUFFICIENT_STOCK');
      }
      const allowanceLines = await this.releaseReturnedAllowance(tx, current.lines);
      await this.rewindAverageCost(tx, current.warehouseId, current.lines);
      for (const line of current.lines) {
        await tx.stockMovement.create({
          data: {
            companyId: this.companyId,
            reference: `${current.reference}-R${line.sortOrder + 1}`,
            productId: line.productId,
            warehouseId: current.warehouseId,
            moveType: StockMoveType.OUT,
            quantity: line.quantity.neg(),
            notes: `إلغاء فاتورة شراء ${displayNumber(current.number)}`,
            sourceType: StockSourceType.PURCHASE_RETURN,
            sourceId: current.id,
            sourceLineId: line.id,
            employeeId: actor.id,
          },
        });
      }
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        sourceType: 'PURCHASE',
        sourceId: current.id,
      });
      if (allowanceLines.length) {
        await postOperationJournal(tx, {
          companyId: this.companyId,
          actorId: actor.id,
          locationId: current.locationId,
          transactionDate: new Date(),
          description: `عكس هبوط ملغى مع فاتورة الشراء ${displayNumber(current.number)}`,
          sourceType: 'PURCHASE_NRV',
          sourceId: current.id,
          lines: allowanceLines,
        });
      }
      const row = await tx.purchaseInvoice.update({
        where: { id: current.id },
        data: {
          status: SalesInvoiceStatus.VOID,
          voidedAt: new Date(),
          voidReason: auditReason,
          voidedById: actor.id,
        },
        include: invoiceInclude,
      });
      await writeDirectAudit(tx, {
        companyId: this.companyId,
        actor,
        reference: current.reference,
        locationId: current.locationId,
        actionType: 'DELETE',
        oldDetails: { status: current.status, total: money(current.total) },
        newDetails: { status: SalesInvoiceStatus.VOID },
        reason: auditReason,
      });
      return present(row);
    });
  }

  async pay(actor: AuthUser, id: string, dto: PurchasePaymentDto) {
    const current = await this.findScoped(actor, id);
    if (current.status !== SalesInvoiceStatus.POSTED) throw new BadRequestException('NOT_POSTED');
    const amount = dec(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('AMOUNT_INVALID');
    const paid = sumPaid(current.payments.filter((payment) => payment.status === SalesPaymentStatus.POSTED));
    if (amount.gt(current.total.minus(paid))) throw new BadRequestException('OVERPAY');

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!project || !project.showIn.includes('OUTCOME')) throw new BadRequestException('PROJECT_NOT_FOR_OUTCOME');

    const fund = dto.fund as FundType;
    let bankId: string | null = null;
    if (fund === FundType.BANK) {
      if (!dto.bankId) throw new BadRequestException('BANK_REQUIRED');
      const bank = await this.prisma.bank.findFirst({
        where: { id: dto.bankId, companyId: this.companyId, status: RecordStatus.ACTIVE },
      });
      if (!bank) throw new BadRequestException('BANK_REQUIRED');
      bankId = bank.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const [opAgg, count] = await Promise.all([
        tx.outcome.aggregate({
          where: { companyId: this.companyId, employeeId: actor.id },
          _max: { operationNumber: true },
        }),
        tx.outcome.count({ where: { companyId: this.companyId } }),
      ]);
      const reference = await this.uniqueOutcomeReference(tx, count + 1);
      const outcome = await tx.outcome.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          projectId: project.id,
          description: `دفع فاتورة ${displayNumber(current.number)}`,
          fund,
          bankId,
          deliverer: '',
          receiver: current.supplierName,
          currency: current.currency,
          fxRate: current.fxRate,
          quantity: new Prisma.Decimal(1),
          amount,
          total: amount,
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId: current.locationId,
          status: TransactionStatus.COMPLETED,
          reference,
        },
      });
      await tx.purchaseInvoicePayment.create({
        data: {
          companyId: this.companyId,
          invoiceId: current.id,
          outcomeId: outcome.id,
          amount,
          employeeId: actor.id,
        },
      });
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        transactionDate: outcome.transactionDate,
        description: `دفع ${outcome.reference}`,
        sourceType: 'OUTCOME',
        sourceId: outcome.id,
        lines: [
          { code: '2100', currency: current.currency, debit: amount, credit: 0, fxRate: current.fxRate },
          { code: fundAccount(fund), currency: current.currency, debit: 0, credit: amount, fxRate: current.fxRate },
        ],
      });
      const row = await tx.purchaseInvoice.findFirstOrThrow({
        where: { id: current.id },
        include: invoiceInclude,
      });
      return present(row);
    });
  }

  async reversePayment(actor: AuthUser, invoiceId: string, paymentId: string, reason: string) {
    if (!canDirectlyChangeOperations(actor)) throw new ForbiddenException('FORBIDDEN');
    const auditReason = requireDirectReason(reason);
    const current = await this.findScoped(actor, invoiceId);
    if (current.status !== SalesInvoiceStatus.POSTED) throw new BadRequestException('NOT_POSTED');
    const payment = current.payments.find((row) => row.id === paymentId);
    if (!payment || payment.status !== SalesPaymentStatus.POSTED) {
      throw new NotFoundException('PAYMENT_NOT_FOUND');
    }

    return this.prisma.$transaction(async (tx) => {
      const outcome = await tx.outcome.findFirst({
        where: { id: payment.outcomeId, companyId: this.companyId },
      });
      if (!outcome || outcome.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException('NOT_EDITABLE');
      }
      await tx.outcome.update({
        where: { id: outcome.id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: outcome.locationId,
        sourceType: 'OUTCOME',
        sourceId: outcome.id,
      });
      await tx.purchaseInvoicePayment.update({
        where: { id: payment.id },
        data: { status: SalesPaymentStatus.REVERSED, reason: auditReason },
      });
      await writeDirectAudit(tx, {
        companyId: this.companyId,
        actor,
        reference: outcome.reference,
        locationId: outcome.locationId,
        actionType: 'DELETE',
        oldDetails: { total: money(outcome.total), invoice: current.reference },
        newDetails: { status: TransactionStatus.DELETED },
        reason: auditReason,
      });
      const row = await tx.purchaseInvoice.findFirstOrThrow({
        where: { id: current.id },
        include: invoiceInclude,
      });
      return present(row);
    });
  }

  private async rewindAverageCost(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    lines: { productId: string; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal }[],
  ) {
    const groups = new Map<string, { qty: Prisma.Decimal; value: Prisma.Decimal }>();
    for (const line of lines) {
      const current = groups.get(line.productId) ?? { qty: new Prisma.Decimal(0), value: new Prisma.Decimal(0) };
      current.qty = current.qty.plus(line.quantity);
      current.value = current.value.plus(line.lineTotal);
      groups.set(line.productId, current);
    }
    for (const [productId, group] of groups) {
      if (group.qty.lte(0)) continue;
      const product = await tx.product.findFirst({ where: { id: productId, companyId: this.companyId } });
      if (!product?.costPrice) continue;
      const onHand = await this.onHand(tx, productId, warehouseId);
      const next = rewoundUnitCost(onHand, product.costPrice, group.qty, group.value);
      if (next == null) {
        const company = await companyOnHand(tx, this.companyId, productId);
        if (company.minus(group.qty).lte(0)) {
          await tx.product.update({ where: { id: productId }, data: { costPrice: null } });
        }
        continue;
      }
      await tx.product.update({
        where: { id: productId },
        data: { costPrice: new Prisma.Decimal(next.toFixed(4)) },
      });
    }
  }

  private async releaseReturnedAllowance(
    tx: Prisma.TransactionClient,
    lines: { productId: string; quantity: Prisma.Decimal }[],
  ) {
    const groups = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      groups.set(line.productId, (groups.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
    }
    const functional = await functionalCurrency(tx, this.companyId);
    const journal: {
      code: string;
      currency: Currency;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      fxRate: Prisma.Decimal | null;
    }[] = [];
    for (const [productId, quantity] of groups) {
      const product = await tx.product.findFirst({ where: { id: productId, companyId: this.companyId } });
      if (!product || product.inventoryAllowance.lte(0) || !product.nrvCurrency) continue;
      const onHand = await companyOnHand(tx, this.companyId, productId);
      const cost = (product.costPrice ?? new Prisma.Decimal(0)).mul(quantity);
      const share = releaseAllowance(product.inventoryAllowance, onHand, quantity, cost);
      if (share.lte(0)) continue;
      await tx.product.update({
        where: { id: productId },
        data: { inventoryAllowance: product.inventoryAllowance.minus(share) },
      });
      const fxRate = await this.allowanceRate(tx, productId, product.nrvCurrency, functional);
      journal.push(
        { code: '1410', currency: product.nrvCurrency, debit: share, credit: new Prisma.Decimal(0), fxRate },
        { code: '5400', currency: product.nrvCurrency, debit: new Prisma.Decimal(0), credit: share, fxRate },
      );
    }
    return journal;
  }

  private async allowanceRate(
    tx: Prisma.TransactionClient,
    productId: string,
    currency: Currency,
    functional: Currency,
  ) {
    if (currency === functional) return null;
    const row = await tx.inventoryAssessmentLine.findFirst({
      where: { productId, assessment: { companyId: this.companyId, currency } },
      orderBy: { assessment: { createdAt: 'desc' } },
      select: { assessment: { select: { fxRate: true } } },
    });
    if (!row?.assessment.fxRate || row.assessment.fxRate.lte(0)) {
      throw new BadRequestException('FX_RATE_REQUIRED');
    }
    return row.assessment.fxRate;
  }

  private async applyAverageCost(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    lines: { productId: string; quantity: Prisma.Decimal; lineTotal: Prisma.Decimal }[],
  ) {
    const groups = new Map<string, { qty: Prisma.Decimal; value: Prisma.Decimal }>();
    for (const line of lines) {
      const current = groups.get(line.productId) ?? {
        qty: new Prisma.Decimal(0),
        value: new Prisma.Decimal(0),
      };
      current.qty = current.qty.plus(line.quantity);
      current.value = current.value.plus(line.lineTotal);
      groups.set(line.productId, current);
    }
    for (const [productId, group] of groups) {
      if (group.qty.lte(0)) continue;
      const product = await tx.product.findFirst({ where: { id: productId, companyId: this.companyId } });
      if (!product) continue;
      const onHand = await this.onHand(tx, productId, warehouseId);
      const known = product.costPrice != null && onHand.gt(0);
      const baseQty = known ? onHand : new Prisma.Decimal(0);
      const baseValue = baseQty.mul(product.costPrice ?? 0);
      const nextQty = baseQty.plus(group.qty);
      const nextCost = baseValue.plus(group.value).div(nextQty);
      await tx.product.update({
        where: { id: productId },
        data: { costPrice: new Prisma.Decimal(nextCost.toFixed(4)) },
      });
    }
  }

  private async prepare(dto: SavePurchaseInvoiceDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!supplier) throw new BadRequestException('SUPPLIER_REQUIRED');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!warehouse) throw new BadRequestException('WAREHOUSE_REQUIRED');
    const lines = await this.prepareLines(dto.lines);
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const discount = dec(dto.discount ?? 0);
    if (discount.gt(subtotal)) throw new BadRequestException('DISCOUNT_INVALID');
    return {
      header: {
        transactionDate: parseDateOnly(dto.transactionDate),
        supplierId: supplier.id,
        supplierName: supplier.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        currency: dto.currency as Currency,
        fxRate: await foreignOperationRate(this.prisma as Prisma.TransactionClient, this.companyId, dto.currency as Currency, dto.fxRate),
        notes: (dto.notes || '').trim(),
        discount,
        subtotal,
        total: subtotal.minus(discount),
        status: SalesInvoiceStatus.DRAFT,
      },
      lines: lines.map((line) => ({
        productId: line.product.id,
        productName: line.product.name,
        sku: line.product.sku,
        unit: line.product.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        lineTotal: line.lineTotal,
        sortOrder: line.sortOrder,
      })),
    };
  }

  private async prepareLines(input: PurchaseLineDto[]): Promise<PreparedLine[]> {
    const ids = [...new Set(input.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return input.map((line, index) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException('PRODUCT_INACTIVE');
      const quantity = dec(line.quantity);
      const unitPrice = dec(line.unitPrice);
      const discount = dec(line.discount ?? 0);
      const gross = quantity.mul(unitPrice);
      if (quantity.lte(0) || discount.lt(0) || discount.gt(gross)) {
        throw new BadRequestException('DISCOUNT_INVALID');
      }
      return { product, quantity, unitPrice, discount, lineTotal: gross.minus(discount), sortOrder: index };
    });
  }

  private assertDraftOwner(actor: AuthUser, invoice: { status: SalesInvoiceStatus; employeeId: string }) {
    if (invoice.status !== SalesInvoiceStatus.DRAFT) throw new BadRequestException('NOT_DRAFT');
    if (actor.role === 'EMPLOYEE' && invoice.employeeId !== actor.id) throw new ForbiddenException('FORBIDDEN');
    if (actor.role === 'MONITOR') throw new ForbiddenException('FORBIDDEN');
  }

  private async findScoped(actor: AuthUser, id: string) {
    const row = await this.prisma.purchaseInvoice.findFirst({
      where: { id, companyId: this.companyId, ...operationListWhere(actor) },
      include: invoiceInclude,
    });
    if (!row) throw new NotFoundException('INVOICE_NOT_FOUND');
    return row;
  }

  private async requireSupplier(id: string) {
    const row = await this.prisma.supplier.findFirst({ where: { id, companyId: this.companyId } });
    if (!row) throw new NotFoundException('SUPPLIER_NOT_FOUND');
    return row;
  }

  private async resolveLocationId(actor: AuthUser, requested?: string) {
    if (isGeneralManager(actor)) {
      if (!requested) throw new BadRequestException('LOCATION_REQUIRED');
      const location = await this.prisma.location.findFirst({
        where: { id: requested, companyId: this.companyId, status: RecordStatus.ACTIVE },
      });
      if (!location) throw new BadRequestException('LOCATION_REQUIRED');
      return location.id;
    }
    if (!actor.locationId) throw new ForbiddenException('LOCATION_REQUIRED');
    return actor.locationId;
  }

  private async nextNumber(tx: Prisma.TransactionClient) {
    const agg = await tx.purchaseInvoice.aggregate({
      where: { companyId: this.companyId },
      _max: { number: true },
    });
    return (agg._max.number ?? 0) + 1;
  }

  private async nextReference(tx: Prisma.TransactionClient) {
    const count = await tx.purchaseInvoice.count({ where: { companyId: this.companyId } });
    for (let step = 0; step < 20; step += 1) {
      const reference = datedReference('PI', count + 1 + step);
      const taken = await tx.purchaseInvoice.findUnique({
        where: { companyId_reference: { companyId: this.companyId, reference } },
        select: { id: true },
      });
      if (!taken) return reference;
    }
    throw new ConflictException('REFERENCE_TAKEN');
  }

  private async uniqueOutcomeReference(tx: Prisma.TransactionClient, serial: number) {
    for (let step = 0; step < 20; step += 1) {
      const reference = datedReference('OUT', serial + step);
      const taken = await tx.outcome.findUnique({
        where: { companyId_reference: { companyId: this.companyId, reference } },
        select: { id: true },
      });
      if (!taken) return reference;
    }
    throw new ConflictException('REFERENCE_TAKEN');
  }

  private async onHand(tx: Prisma.TransactionClient, productId: string, warehouseId: string) {
    const agg = await tx.stockMovement.aggregate({
      where: { companyId: this.companyId, productId, warehouseId },
      _sum: { quantity: true },
    });
    return new Prisma.Decimal(agg._sum.quantity ?? 0);
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function present(row: Prisma.PurchaseInvoiceGetPayload<{ include: typeof invoiceInclude }>) {
  const posted = row.payments.filter((payment) => payment.status === SalesPaymentStatus.POSTED);
  const paid = sumPaid(posted);
  return {
    id: row.id,
    number: displayNumber(row.number),
    reference: row.reference,
    transactionDate: dateOnly(row.transactionDate),
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    currency: row.currency,
    fxRate: row.fxRate ? row.fxRate.toString() : null,
    notes: row.notes,
    discount: money(row.discount),
    subtotal: money(row.subtotal),
    total: money(row.total),
    paid: money(paid),
    balance: money(row.total.minus(paid)),
    paymentState: paymentState(row.total, paid),
    status: row.status,
    employeeName: row.employee.name,
    locationId: row.locationId,
    locationName: row.location?.name || '',
    postedAt: row.postedAt?.toISOString() || null,
    voidedAt: row.voidedAt?.toISOString() || null,
    voidReason: row.voidReason,
    voidedByName: row.voidedBy?.name || '',
    lines: row.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      unit: line.unit,
      quantity: money(line.quantity),
      unitPrice: money(line.unitPrice),
      discount: money(line.discount),
      lineTotal: money(line.lineTotal),
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amount: money(payment.amount),
      status: payment.status,
      reason: payment.reason,
      employeeName: payment.employee.name,
      outcomeId: payment.outcome.id,
      outcomeReference: payment.outcome.reference,
      fund: payment.outcome.fund,
      transactionDate: dateOnly(payment.outcome.transactionDate),
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}

function sumPaid(rows: { amount: Prisma.Decimal }[]) {
  return rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
}

function paymentState(total: Prisma.Decimal, paid: Prisma.Decimal) {
  if (paid.lte(0)) return 'UNPAID' as const;
  if (paid.plus(new Prisma.Decimal('0.00005')).gte(total)) return 'PAID' as const;
  return 'PARTIAL' as const;
}

function displayNumber(number: number) {
  return `PI-${String(number).padStart(5, '0')}`;
}

function money(value: Prisma.Decimal) {
  return value.toFixed(4).replace(/\.?0+$/, '') || '0';
}

function dec(value: number) {
  return new Prisma.Decimal(value.toFixed(4));
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function datedReference(prefix: string, serial: number, when = new Date()) {
  const y = String(when.getFullYear()).slice(2);
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}-${String(serial).padStart(3, '0')}`;
}
