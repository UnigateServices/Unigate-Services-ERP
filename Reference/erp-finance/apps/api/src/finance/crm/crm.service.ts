import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityStatus,
  ActivityType,
  Currency,
  LeadStatus,
  OpportunityStage,
  Prisma,
  QuoteStatus,
  RecordStatus,
  Role,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { seesEveryOffice } from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { foreignOperationRate } from '../ledger/fx-journal';
import { SalesService } from '../sales/sales.service';
import { ActivityDto, LeadDto, OpportunityDto, QuoteDto, QuoteStatusDto } from './dto/crm.dto';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sales: SalesService,
  ) {}

  async leads(actor: AuthUser) {
    const rows = await this.prisma.lead.findMany({
      where: { companyId: this.companyId, ...this.ownerWhere(actor, 'ownerId') },
      include: { owner: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      notes: row.notes,
      status: row.status,
      ownerId: row.ownerId,
      ownerName: row.owner.name,
      customerId: row.customerId,
      customerName: row.customer?.name || '',
    }));
  }

  async createLead(actor: AuthUser, dto: LeadDto) {
    const ownerId = await this.resolveOwner(actor, dto.ownerId);
    const row = await this.prisma.lead.create({
      data: {
        companyId: this.companyId,
        name: dto.name.trim(),
        phone: (dto.phone || '').trim(),
        address: (dto.address || '').trim(),
        notes: (dto.notes || '').trim(),
        ownerId,
      },
      include: { owner: { select: { name: true } } },
    });
    return { id: row.id, name: row.name, status: row.status, ownerName: row.owner.name };
  }

  async convertLead(actor: AuthUser, id: string) {
    const lead = await this.findLead(actor, id);
    if (lead.status === LeadStatus.CONVERTED && lead.customerId) {
      return { id: lead.id, customerId: lead.customerId, status: lead.status };
    }
    const customer = await this.prisma.customer.upsert({
      where: { companyId_name: { companyId: this.companyId, name: lead.name } },
      update: { phone: lead.phone, address: lead.address, notes: lead.notes },
      create: {
        companyId: this.companyId,
        name: lead.name,
        phone: lead.phone,
        address: lead.address,
        notes: lead.notes,
      },
    });
    const row = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.CONVERTED, customerId: customer.id, convertedAt: new Date() },
    });
    return { id: row.id, customerId: customer.id, status: row.status, customerName: customer.name };
  }

  async opportunities(actor: AuthUser) {
    const rows = await this.prisma.opportunity.findMany({
      where: { companyId: this.companyId, ...this.ownerWhere(actor, 'ownerId') },
      include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      stage: row.stage,
      expectedAmount: money(row.expectedAmount),
      probability: row.probability,
      currency: row.currency,
      ownerId: row.ownerId,
      ownerName: row.owner.name,
      customerId: row.customerId,
      customerName: row.customer.name,
      closeDate: row.closeDate ? iso(row.closeDate) : '',
      lossReason: row.lossReason,
    }));
  }

  async createOpportunity(actor: AuthUser, dto: OpportunityDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!customer) throw new BadRequestException('CUSTOMER_REQUIRED');
    const ownerId = await this.resolveOwner(actor, dto.ownerId);
    const stage = (dto.stage || 'NEW') as OpportunityStage;
    if (stage === OpportunityStage.LOST && !(dto.lossReason || '').trim()) {
      throw new BadRequestException('LOSS_REASON');
    }
    const row = await this.prisma.opportunity.create({
      data: {
        companyId: this.companyId,
        customerId: customer.id,
        title: dto.title.trim(),
        stage,
        expectedAmount: dto.expectedAmount ?? 0,
        probability: dto.probability ?? 0,
        currency: (dto.currency || 'USD') as Currency,
        ownerId,
        closeDate: dto.closeDate ? parseDate(dto.closeDate) : null,
        lossReason: (dto.lossReason || '').trim(),
      },
    });
    return { id: row.id, title: row.title, stage: row.stage };
  }

  async updateOpportunity(actor: AuthUser, id: string, dto: OpportunityDto) {
    const current = await this.prisma.opportunity.findFirst({
      where: { id, companyId: this.companyId, ...this.ownerWhere(actor, 'ownerId') },
    });
    if (!current) throw new NotFoundException('OPPORTUNITY_NOT_FOUND');
    const stage = (dto.stage || current.stage) as OpportunityStage;
    if (stage === OpportunityStage.LOST && !(dto.lossReason || current.lossReason).trim()) {
      throw new BadRequestException('LOSS_REASON');
    }
    const row = await this.prisma.opportunity.update({
      where: { id },
      data: {
        title: dto.title.trim(),
        stage,
        expectedAmount: dto.expectedAmount ?? current.expectedAmount,
        probability: dto.probability ?? current.probability,
        currency: (dto.currency || current.currency) as Currency,
        closeDate: dto.closeDate ? parseDate(dto.closeDate) : current.closeDate,
        lossReason: (dto.lossReason || '').trim(),
      },
    });
    return { id: row.id, stage: row.stage };
  }

  async activities(actor: AuthUser) {
    const rows = await this.prisma.activity.findMany({
      where: { companyId: this.companyId, ...this.ownerWhere(actor, 'ownerId') },
      include: { owner: { select: { name: true } } },
      orderBy: { dueAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      dueAt: row.dueAt.toISOString(),
      status: row.status,
      notes: row.notes,
      ownerId: row.ownerId,
      ownerName: row.owner.name,
      customerId: row.customerId,
      leadId: row.leadId,
      opportunityId: row.opportunityId,
    }));
  }

  async createActivity(actor: AuthUser, dto: ActivityDto) {
    const ownerId = await this.resolveOwner(actor, dto.ownerId);
    const due = new Date(dto.dueAt);
    if (Number.isNaN(due.getTime())) throw new BadRequestException('DATE_INVALID');
    const row = await this.prisma.activity.create({
      data: {
        companyId: this.companyId,
        type: dto.type as ActivityType,
        title: dto.title.trim(),
        dueAt: due,
        status: (dto.status || 'OPEN') as ActivityStatus,
        notes: (dto.notes || '').trim(),
        ownerId,
        customerId: dto.customerId || null,
        leadId: dto.leadId || null,
        opportunityId: dto.opportunityId || null,
      },
    });
    return { id: row.id, title: row.title, type: row.type, status: row.status };
  }

  async quotes(actor: AuthUser) {
    const rows = await this.prisma.quote.findMany({
      where: { companyId: this.companyId, ...this.ownerWhere(actor, 'employeeId') },
      include: { customer: { select: { name: true } }, employee: { select: { name: true } }, lines: true },
      orderBy: [{ number: 'desc' }, { version: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      version: row.version,
      status: row.status,
      customerId: row.customerId,
      customerName: row.customer.name,
      opportunityId: row.opportunityId,
      currency: row.currency,
      fxRate: row.fxRate ? Number(row.fxRate) : null,
      total: money(row.total),
      employeeName: row.employee.name,
      salesInvoiceId: row.salesInvoiceId,
      validUntil: row.validUntil ? iso(row.validUntil) : '',
      lineCount: row.lines.length,
    }));
  }

  async quote(actor: AuthUser, id: string) {
    const row = await this.findQuote(actor, id);
    return {
      id: row.id,
      number: row.number,
      version: row.version,
      status: row.status,
      customerId: row.customerId,
      customerName: row.customer.name,
      opportunityId: row.opportunityId,
      currency: row.currency,
      fxRate: row.fxRate ? Number(row.fxRate) : null,
      discount: money(row.discount),
      total: money(row.total),
      notes: row.notes,
      salesInvoiceId: row.salesInvoiceId,
      validUntil: row.validUntil ? iso(row.validUntil) : '',
      lines: row.lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount),
        lineTotal: money(line.lineTotal),
      })),
    };
  }

  async createQuote(actor: AuthUser, dto: QuoteDto) {
    const built = await this.buildQuote(actor, dto);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.quote.findFirst({
        where: { companyId: this.companyId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const row = await tx.quote.create({
        data: {
          companyId: this.companyId,
          number: (last?.number ?? 0) + 1,
          version: 1,
          ...built.header,
          employeeId: actor.id,
          lines: { create: built.lines },
        },
      });
      return { id: row.id, number: row.number, version: row.version, total: money(row.total) };
    });
  }

  async reviseQuote(actor: AuthUser, id: string) {
    const current = await this.findQuote(actor, id);
    const row = await this.prisma.quote.create({
      data: {
        companyId: this.companyId,
        number: current.number,
        version: current.version + 1,
        parentId: current.parentId || current.id,
        customerId: current.customerId,
        opportunityId: current.opportunityId,
        status: QuoteStatus.DRAFT,
        currency: current.currency,
        fxRate: current.fxRate,
        validUntil: current.validUntil,
        notes: current.notes,
        subtotal: current.subtotal,
        discount: current.discount,
        total: current.total,
        employeeId: actor.id,
        lines: {
          create: current.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            lineTotal: line.lineTotal,
            sortOrder: line.sortOrder,
          })),
        },
      },
    });
    return { id: row.id, number: row.number, version: row.version, status: row.status };
  }

  async setQuoteStatus(actor: AuthUser, id: string, dto: QuoteStatusDto) {
    const current = await this.findQuote(actor, id);
    if (current.status === QuoteStatus.ACCEPTED || current.salesInvoiceId) throw new BadRequestException('QUOTE_ACCEPTED');
    const row = await this.prisma.quote.update({
      where: { id: current.id },
      data: { status: dto.status as QuoteStatus },
    });
    if (dto.status === 'ACCEPTED') await this.settleWon(actor, current);
    return { id: row.id, status: row.status };
  }

  async acceptQuote(actor: AuthUser, id: string) {
    const current = await this.findQuote(actor, id);
    if (current.salesInvoiceId) throw new BadRequestException('QUOTE_ACCEPTED');
    if (!current.lines.length) throw new BadRequestException('LINES_REQUIRED');
    await this.settleWon(actor, current);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { companyId: this.companyId, status: RecordStatus.ACTIVE },
      orderBy: { isDefault: 'desc' },
    });
    if (!warehouse) throw new BadRequestException('WAREHOUSE_REQUIRED');
    const location = actor.locationId
      ? actor.locationId
      : (
          await this.prisma.location.findFirst({
            where: { companyId: this.companyId, status: RecordStatus.ACTIVE },
            orderBy: { name: 'asc' },
          })
        )?.id;
    if (!location) throw new BadRequestException('LOCATION_REQUIRED');
    const beforeJournals = await this.prisma.journalEntry.count({ where: { companyId: this.companyId } });
    const beforeStock = await this.prisma.stockMovement.count({ where: { companyId: this.companyId } });
    const beforeCash = await this.prisma.income.count({ where: { companyId: this.companyId, status: { not: 'DELETED' } } });
    const invoice = await this.sales.create(actor, {
      transactionDate: today(),
      customerId: current.customerId,
      warehouseId: warehouse.id,
      currency: current.currency,
      notes: current.notes,
      discount: Number(current.discount),
      locationId: location,
      lines: current.lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount),
      })),
    });
    await this.prisma.quote.update({
      where: { id: current.id },
      data: { status: QuoteStatus.ACCEPTED, salesInvoiceId: invoice.id },
    });
    const afterJournals = await this.prisma.journalEntry.count({ where: { companyId: this.companyId } });
    const afterStock = await this.prisma.stockMovement.count({ where: { companyId: this.companyId } });
    const afterCash = await this.prisma.income.count({ where: { companyId: this.companyId, status: { not: 'DELETED' } } });
    return {
      quoteId: current.id,
      status: QuoteStatus.ACCEPTED,
      invoiceId: invoice.id,
      invoiceReference: invoice.reference,
      invoiceStatus: invoice.status,
      journalUnchanged: beforeJournals === afterJournals,
      stockUnchanged: beforeStock === afterStock,
      cashUnchanged: beforeCash === afterCash,
    };
  }

  private async buildQuote(actor: AuthUser, dto: QuoteDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!customer) throw new BadRequestException('CUSTOMER_REQUIRED');
    if (!dto.lines.length) throw new BadRequestException('LINES_REQUIRED');
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.lines.map((line) => line.productId) }, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const lines = dto.lines.map((line, index) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException('PRODUCT_NOT_FOUND');
      const gross = new Prisma.Decimal(line.quantity).mul(line.unitPrice);
      const discount = new Prisma.Decimal(line.discount ?? 0);
      if (discount.gt(gross)) throw new BadRequestException('DISCOUNT_INVALID');
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount,
        lineTotal: gross.minus(discount),
        sortOrder: index,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
    const discount = new Prisma.Decimal(dto.discount ?? 0);
    if (discount.gt(subtotal)) throw new BadRequestException('DISCOUNT_INVALID');
    const currency = dto.currency as Currency;
    const fxRate = await foreignOperationRate(this.prisma, this.companyId, currency, undefined, {
      date: new Date(),
    });
    return {
      header: {
        customerId: customer.id,
        opportunityId: dto.opportunityId || null,
        currency,
        fxRate,
        validUntil: dto.validUntil ? parseDate(dto.validUntil) : null,
        notes: (dto.notes || '').trim(),
        subtotal,
        discount,
        total: subtotal.minus(discount),
      },
      lines,
    };
  }

  private async settleWon(
    actor: AuthUser,
    quote: { opportunityId: string | null; customer: { id: string; name: string } },
  ) {
    if (quote.opportunityId) {
      await this.prisma.opportunity.update({
        where: { id: quote.opportunityId },
        data: { stage: OpportunityStage.WON },
      });
    }
    await this.ensureLeadConverted(actor, quote.customer);
  }

  private async ensureLeadConverted(actor: AuthUser, customer: { id: string; name: string }) {
    const scope = this.ownerWhere(actor, 'ownerId');
    const linked = await this.prisma.lead.findFirst({
      where: {
        companyId: this.companyId,
        status: { not: LeadStatus.CONVERTED },
        ...scope,
        OR: [{ customerId: customer.id }, { name: customer.name }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!linked) return null;
    return this.convertLead(actor, linked.id);
  }

  private async findLead(actor: AuthUser, id: string) {
    const row = await this.prisma.lead.findFirst({
      where: { id, companyId: this.companyId, ...this.ownerWhere(actor, 'ownerId') },
    });
    if (!row) throw new NotFoundException('LEAD_NOT_FOUND');
    return row;
  }

  private async findQuote(actor: AuthUser, id: string) {
    const row = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId, ...this.ownerWhere(actor, 'employeeId') },
      include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) throw new NotFoundException('QUOTE_NOT_FOUND');
    return row;
  }

  private ownerWhere(actor: AuthUser, field: 'ownerId' | 'employeeId') {
    if (actor.role === Role.EMPLOYEE) return { [field]: actor.id };
    if (!seesEveryOffice(actor) && actor.role !== Role.SUPERVISOR) return { [field]: actor.id };
    return {};
  }

  private async resolveOwner(actor: AuthUser, requested?: string) {
    if (actor.role === Role.EMPLOYEE) return actor.id;
    if (!requested || requested === actor.id) return actor.id;
    const owner = await this.prisma.employee.findFirst({
      where: { id: requested, companyId: this.companyId, accountStatus: RecordStatus.ACTIVE },
    });
    if (!owner) throw new ForbiddenException('EMPLOYEE_NOT_FOUND');
    return owner.id;
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function money(value: Prisma.Decimal | number) {
  return new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2);
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
