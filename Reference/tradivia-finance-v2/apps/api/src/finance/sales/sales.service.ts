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
import { releaseAllowance } from '../ledger/inventory-nrv';
import { companyOnHand } from '../inventory/inventory-nrv.service';
import { foreignOperationRate } from '../ledger/fx-journal';
import { CustomerDto, ListSalesQueryDto, SalesLineDto, SalesPaymentDto, SaveSalesInvoiceDto } from './dto/sales.dto';

const invoiceInclude = {
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      employee: { select: { name: true } },
      income: { select: { id: true, reference: true, fund: true, status: true, transactionDate: true } },
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
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  listCustomers(actor: AuthUser) {
    return this.prisma.customer.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === 'EMPLOYEE' || actor.role === 'MONITOR' ? { status: RecordStatus.ACTIVE } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCustomer(dto: CustomerDto) {
    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('NAME_REQUIRED');
    const taken = await this.prisma.customer.findUnique({
      where: { companyId_name: { companyId: this.companyId, name } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('CUSTOMER_EXISTS');
    return this.prisma.customer.create({
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

  async updateCustomer(id: string, dto: CustomerDto) {
    const current = await this.requireCustomer(id);
    const name = cleanName(dto.name);
    if (!name) throw new BadRequestException('NAME_REQUIRED');
    const taken = await this.prisma.customer.findUnique({
      where: { companyId_name: { companyId: this.companyId, name } },
      select: { id: true },
    });
    if (taken && taken.id !== current.id) throw new ConflictException('CUSTOMER_EXISTS');
    return this.prisma.customer.update({
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

  async removeCustomer(id: string) {
    const current = await this.requireCustomer(id);
    const used = await this.prisma.salesInvoice.count({ where: { customerId: current.id } });
    if (used > 0) {
      await this.prisma.customer.update({
        where: { id: current.id },
        data: { status: RecordStatus.INACTIVE },
      });
      return { deactivated: true, id: current.id };
    }
    await this.prisma.customer.delete({ where: { id: current.id } });
    return { deactivated: false, id: current.id };
  }

  async list(actor: AuthUser, query: ListSalesQueryDto) {
    const q = (query.q || '').trim();
    const rows = await this.prisma.salesInvoice.findMany({
      where: {
        companyId: this.companyId,
        ...operationListWhere(actor),
        ...(query.status ? { status: query.status } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { customerName: { contains: q, mode: 'insensitive' } },
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
      customerName: row.customerName,
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
    const row = await this.findScoped(actor, id);
    return present(row);
  }

  async create(actor: AuthUser, dto: SaveSalesInvoiceDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const prepared = await this.prepare(dto);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx);
      const reference = await this.nextReference(tx);
      const row = await tx.salesInvoice.create({
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

  async update(actor: AuthUser, id: string, dto: SaveSalesInvoiceDto) {
    const current = await this.findScoped(actor, id);
    this.assertDraftOwner(actor, current);
    const locationId = await this.resolveLocationId(actor, dto.locationId ?? current.locationId ?? undefined);
    const prepared = await this.prepare(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: current.id } });
      const row = await tx.salesInvoice.update({
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
    await this.prisma.salesInvoice.delete({ where: { id: current.id } });
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
    const customer = await this.prisma.customer.findFirst({
      where: { id: current.customerId, companyId: this.companyId },
    });
    if (!customer || customer.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('CUSTOMER_INACTIVE');
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
      for (const product of products) {
        if (product.inventoryAllowance.gt(0) && product.nrvCurrency && product.nrvCurrency !== current.currency) {
          throw new BadRequestException('NRV_CURRENCY');
        }
      }
      const need = new Map<string, Prisma.Decimal>();
      for (const line of current.lines) {
        need.set(line.productId, (need.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
      }
      for (const [productId, quantity] of need) {
        const onHand = await this.onHand(tx, productId, current.warehouseId);
        if (onHand.lt(quantity)) throw new BadRequestException('INSUFFICIENT_STOCK');
      }
      for (const line of current.lines) {
        await tx.stockMovement.create({
          data: {
            companyId: this.companyId,
            reference: `${current.reference}-L${line.sortOrder + 1}`,
            productId: line.productId,
            warehouseId: current.warehouseId,
            moveType: StockMoveType.OUT,
            quantity: line.quantity.neg(),
            notes: `فاتورة ${displayNumber(current.number)}`,
            sourceType: StockSourceType.SALES_ISSUE,
            sourceId: current.id,
            sourceLineId: line.id,
            employeeId: actor.id,
          },
        });
      }
      const row = await tx.salesInvoice.update({
        where: { id: current.id },
        data: { status: SalesInvoiceStatus.POSTED, postedAt: new Date() },
        include: invoiceInclude,
      });
      let cogs = new Prisma.Decimal(0);
      let released = new Prisma.Decimal(0);
      await assertWeightedAverage(tx, this.companyId);
      for (const [productId, quantity] of need) {
        const product = products.find((row) => row.id === productId);
        const cost = product?.costPrice ?? new Prisma.Decimal(0);
        const lineCost = cost.mul(quantity);
        cogs = cogs.plus(lineCost);
        if (!product || product.inventoryAllowance.lte(0)) continue;
        const onHandAfter = await companyOnHand(tx, this.companyId, productId);
        const onHandBefore = onHandAfter.plus(quantity);
        const share = releaseAllowance(product.inventoryAllowance, onHandBefore, quantity, lineCost);
        if (share.lte(0)) continue;
        released = released.plus(share);
        await tx.product.update({
          where: { id: productId },
          data: { inventoryAllowance: product.inventoryAllowance.minus(share) },
        });
        const holder = current.lines.find((line) => line.productId === productId);
        if (holder) {
          await tx.salesInvoiceLine.update({ where: { id: holder.id }, data: { nrvRelease: share } });
        }
      }
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        transactionDate: current.transactionDate,
        description: `فاتورة بيع ${displayNumber(current.number)}`,
        sourceType: 'SALES',
        sourceId: current.id,
        lines: [
          { code: '1200', currency: current.currency, debit: current.total, credit: 0, fxRate: current.fxRate },
          { code: '4100', currency: current.currency, debit: 0, credit: current.total, fxRate: current.fxRate },
          ...(cogs.gt(0)
            ? [
                { code: '5100', currency: current.currency, debit: cogs, credit: 0, fxRate: current.fxRate },
                { code: '1400', currency: current.currency, debit: 0, credit: cogs, fxRate: current.fxRate },
              ]
            : []),
          ...(released.gt(0)
            ? [
                { code: '1410', currency: current.currency, debit: released, credit: 0, fxRate: current.fxRate },
                { code: '5100', currency: current.currency, debit: 0, credit: released, fxRate: current.fxRate },
              ]
            : []),
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
    const openPayment = current.payments.some((payment) => payment.status === SalesPaymentStatus.POSTED);
    if (openPayment) throw new BadRequestException('PAYMENTS_OPEN');

    return this.prisma.$transaction(async (tx) => {
      const productIds = [...new Set(current.lines.map((line) => line.productId))].sort();
      if (productIds.length) {
        await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`;
      }
      for (const line of current.lines) {
        await tx.stockMovement.create({
          data: {
            companyId: this.companyId,
            reference: `${current.reference}-R${line.sortOrder + 1}`,
            productId: line.productId,
            warehouseId: current.warehouseId,
            moveType: StockMoveType.IN,
            quantity: line.quantity,
            notes: `إلغاء فاتورة ${displayNumber(current.number)}`,
            sourceType: StockSourceType.SALES_RETURN,
            sourceId: current.id,
            sourceLineId: line.id,
            employeeId: actor.id,
          },
        });
      }
      for (const line of current.lines) {
        if (line.nrvRelease.gt(0)) {
          await tx.product.update({
            where: { id: line.productId },
            data: { inventoryAllowance: { increment: line.nrvRelease } },
          });
        }
      }
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        sourceType: 'SALES',
        sourceId: current.id,
      });
      const row = await tx.salesInvoice.update({
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

  async pay(actor: AuthUser, id: string, dto: SalesPaymentDto) {
    const current = await this.findScoped(actor, id);
    if (current.status !== SalesInvoiceStatus.POSTED) throw new BadRequestException('NOT_POSTED');
    const amount = dec(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('AMOUNT_INVALID');
    const paid = sumPaid(current.payments.filter((payment) => payment.status === SalesPaymentStatus.POSTED));
    const balance = current.total.minus(paid);
    if (amount.gt(balance)) throw new BadRequestException('OVERPAY');

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!project || !project.showIn.includes('INCOME')) throw new BadRequestException('PROJECT_NOT_FOR_INCOME');

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
        tx.income.aggregate({
          where: { companyId: this.companyId, employeeId: actor.id },
          _max: { operationNumber: true },
        }),
        tx.income.count({ where: { companyId: this.companyId } }),
      ]);
      const reference = await this.uniqueIncomeReference(tx, count + 1);
      const income = await tx.income.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          projectId: project.id,
          description: `قبض فاتورة ${displayNumber(current.number)}`,
          fund,
          bankId,
          sender: current.customerName,
          receiver: '',
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
      await tx.salesInvoicePayment.create({
        data: {
          companyId: this.companyId,
          invoiceId: current.id,
          incomeId: income.id,
          amount,
          employeeId: actor.id,
        },
      });
      await postOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: current.locationId,
        transactionDate: income.transactionDate,
        description: `قبض ${income.reference}`,
        sourceType: 'INCOME',
        sourceId: income.id,
        lines: [
          { code: fundAccount(fund), currency: current.currency, debit: amount, credit: 0, fxRate: current.fxRate },
          { code: '1200', currency: current.currency, debit: 0, credit: amount, fxRate: current.fxRate },
        ],
      });
      const row = await tx.salesInvoice.findFirstOrThrow({
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
      const income = await tx.income.findFirst({
        where: { id: payment.incomeId, companyId: this.companyId },
      });
      if (!income || income.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException('NOT_EDITABLE');
      }
      await tx.income.update({
        where: { id: income.id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: income.locationId,
        sourceType: 'INCOME',
        sourceId: income.id,
      });
      await tx.salesInvoicePayment.update({
        where: { id: payment.id },
        data: { status: SalesPaymentStatus.REVERSED, reason: auditReason },
      });
      await writeDirectAudit(tx, {
        companyId: this.companyId,
        actor,
        reference: income.reference,
        locationId: income.locationId,
        actionType: 'DELETE',
        oldDetails: { total: money(income.total), invoice: current.reference },
        newDetails: { status: TransactionStatus.DELETED },
        reason: auditReason,
      });
      const row = await tx.salesInvoice.findFirstOrThrow({
        where: { id: current.id },
        include: invoiceInclude,
      });
      return present(row);
    });
  }

  private async prepare(dto: SaveSalesInvoiceDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!customer) throw new BadRequestException('CUSTOMER_REQUIRED');
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!warehouse) throw new BadRequestException('WAREHOUSE_REQUIRED');
    const lines = await this.prepareLines(dto.lines);
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const discount = dec(dto.discount ?? 0);
    if (discount.gt(subtotal)) throw new BadRequestException('DISCOUNT_INVALID');
    const total = subtotal.minus(discount);
    return {
      header: {
        transactionDate: parseDateOnly(dto.transactionDate),
        customerId: customer.id,
        customerName: customer.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        currency: dto.currency as Currency,
        fxRate: await foreignOperationRate(this.prisma as Prisma.TransactionClient, this.companyId, dto.currency as Currency, dto.fxRate),
        notes: (dto.notes || '').trim(),
        discount,
        subtotal,
        total,
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

  private async prepareLines(input: SalesLineDto[]): Promise<PreparedLine[]> {
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
      return {
        product,
        quantity,
        unitPrice,
        discount,
        lineTotal: gross.minus(discount),
        sortOrder: index,
      };
    });
  }

  private assertDraftOwner(
    actor: AuthUser,
    invoice: { status: SalesInvoiceStatus; employeeId: string },
  ) {
    if (invoice.status !== SalesInvoiceStatus.DRAFT) throw new BadRequestException('NOT_DRAFT');
    if (actor.role === 'EMPLOYEE' && invoice.employeeId !== actor.id) {
      throw new ForbiddenException('FORBIDDEN');
    }
    if (actor.role === 'MONITOR') throw new ForbiddenException('FORBIDDEN');
  }

  private async findScoped(actor: AuthUser, id: string) {
    const row = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId: this.companyId, ...operationListWhere(actor) },
      include: invoiceInclude,
    });
    if (!row) throw new NotFoundException('INVOICE_NOT_FOUND');
    return row;
  }

  private async requireCustomer(id: string) {
    const row = await this.prisma.customer.findFirst({ where: { id, companyId: this.companyId } });
    if (!row) throw new NotFoundException('CUSTOMER_NOT_FOUND');
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
    const agg = await tx.salesInvoice.aggregate({
      where: { companyId: this.companyId },
      _max: { number: true },
    });
    return (agg._max.number ?? 0) + 1;
  }

  private async nextReference(tx: Prisma.TransactionClient) {
    const count = await tx.salesInvoice.count({ where: { companyId: this.companyId } });
    for (let step = 0; step < 20; step += 1) {
      const reference = datedReference('SI', count + 1 + step);
      const taken = await tx.salesInvoice.findUnique({
        where: { companyId_reference: { companyId: this.companyId, reference } },
        select: { id: true },
      });
      if (!taken) return reference;
    }
    throw new ConflictException('REFERENCE_TAKEN');
  }

  private async uniqueIncomeReference(tx: Prisma.TransactionClient, serial: number) {
    for (let step = 0; step < 20; step += 1) {
      const reference = datedReference('IN', serial + step);
      const taken = await tx.income.findUnique({
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

function present(
  row: Prisma.SalesInvoiceGetPayload<{ include: typeof invoiceInclude }>,
) {
  const posted = row.payments.filter((payment) => payment.status === SalesPaymentStatus.POSTED);
  const paid = sumPaid(posted);
  return {
    id: row.id,
    number: displayNumber(row.number),
    reference: row.reference,
    transactionDate: dateOnly(row.transactionDate),
    customerId: row.customerId,
    customerName: row.customerName,
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
      incomeId: payment.income.id,
      incomeReference: payment.income.reference,
      fund: payment.income.fund,
      transactionDate: dateOnly(payment.income.transactionDate),
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
  return `SI-${String(number).padStart(5, '0')}`;
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
