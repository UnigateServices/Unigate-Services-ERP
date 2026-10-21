import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountType,
  Currency,
  FundType,
  OpenItemKind,
  OpenItemParty,
  OpenItemStatus,
  Prisma,
  RecordStatus,
  SettlementMode,
  TransactionStatus,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { functionalCurrency, foreignOperationRate } from '../ledger/fx-journal';
import { fundAccount, postOperationJournal } from '../ledger/post-source';
import { translatedLine } from '../statements/functional-view';
import { CollectOpenItemDto, CreateOpenItemDto, RevalueOpenItemsDto } from './dto/open-item.dto';
import { allocateItem, buildSettlementFxJournal, CONTROL_ACCOUNT, insertOpenItem, isMonetaryOpenItem } from './open-item-book';

const includeParty = {
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  borrower: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OpenItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list() {
    const rows = await this.prisma.openItem.findMany({
      where: { companyId: this.companyId },
      include: includeParty,
      orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(presentItem);
  }

  async create(actor: AuthUser, dto: CreateOpenItemDto) {
    const kind = dto.kind as OpenItemKind;
    const party = dto.party as OpenItemParty;
    if (kind === OpenItemKind.ADVANCE_OUT || (party === OpenItemParty.CUSTOMER && kind !== OpenItemKind.RECEIVABLE)) {
      throw new BadRequestException('OPEN_ITEM_KIND');
    }
    if (party === OpenItemParty.SUPPLIER && kind !== OpenItemKind.PAYABLE && kind !== OpenItemKind.ADVANCE_IN) {
      throw new BadRequestException('OPEN_ITEM_KIND');
    }
    const customer = party === OpenItemParty.CUSTOMER ? await this.requireCustomer(dto.customerId) : null;
    const supplier = party === OpenItemParty.SUPPLIER ? await this.requireSupplier(dto.supplierId) : null;
    const currency = dto.currency as Currency;
    const documentDate = parseDate(dto.documentDate);
    return this.prisma.$transaction(async (tx) => {
      const fxRate = await foreignOperationRate(tx, this.companyId, currency, undefined, {
        date: documentDate,
      });
      const row = await insertOpenItem(tx, {
        companyId: this.companyId,
        party,
        customerId: customer?.id,
        supplierId: supplier?.id,
        partyName: customer?.name || supplier?.name || '',
        kind,
        documentDate,
        dueDate: dto.dueDate ? parseDate(dto.dueDate) : documentDate,
        currency,
        fxRate,
        amount: new Prisma.Decimal(dto.amount),
        settlementMode: dto.settlementMode as SettlementMode,
        sourceType: 'MANUAL',
        memo: (dto.memo || '').trim(),
      });
      return presentItem(await tx.openItem.findFirstOrThrow({ where: { id: row.id }, include: includeParty }));
    });
  }

  async remove(id: string) {
    const row = await this.prisma.openItem.findFirst({
      where: { id, companyId: this.companyId },
      include: { allocations: true },
    });
    if (!row) throw new NotFoundException('OPEN_ITEM_NOT_FOUND');
    if (row.sourceType !== 'MANUAL') throw new BadRequestException('OPEN_ITEM_LOCKED');
    if (row.allocations.length) throw new BadRequestException('ALLOCATIONS_OPEN');
    await this.prisma.openItem.delete({ where: { id } });
    return { id };
  }

  async statement(partyId: string) {
    const rows = await this.prisma.openItem.findMany({
      where: {
        companyId: this.companyId,
        OR: [{ customerId: partyId }, { supplierId: partyId }, { borrowerId: partyId }],
      },
      include: { allocations: true },
      orderBy: [{ documentDate: 'asc' }, { createdAt: 'asc' }],
    });
    if (!rows.length) throw new NotFoundException('OPEN_ITEM_NOT_FOUND');
    const items = rows.map((row) => ({
      ...presentItem(row),
      allocations: row.allocations.map((allocation) => ({
        id: allocation.id,
        amount: money(allocation.amount),
        settlementFxRate: allocation.settlementFxRate ? Number(allocation.settlementFxRate) : null,
        fxDifference: money(allocation.fxDifference),
        sourceType: allocation.sourceType,
        memo: allocation.memo,
      })),
    }));
    const remaining = rows.reduce((sum, row) => {
      const sign =
        row.kind === OpenItemKind.RECEIVABLE || row.kind === OpenItemKind.ADVANCE_IN || row.kind === OpenItemKind.CUSTODY
          ? 1
          : -1;
      return sum.plus(row.remaining.mul(sign));
    }, new Prisma.Decimal(0));
    return {
      partyName: rows[0].partyName,
      gross: true,
      items,
      net: money(remaining),
    };
  }

  async aging(asOf: string) {
    const date = parseDate(asOf || today());
    const rows = await this.prisma.openItem.findMany({
      where: {
        companyId: this.companyId,
        status: OpenItemStatus.OPEN,
        kind: { in: [OpenItemKind.RECEIVABLE, OpenItemKind.PAYABLE] },
      },
      orderBy: { documentDate: 'asc' },
    });
    const buckets = [
      { code: '0-30', name: 'حتى 30 يوماً', amount: new Prisma.Decimal(0) },
      { code: '31-60', name: '31 إلى 60', amount: new Prisma.Decimal(0) },
      { code: '61-90', name: '61 إلى 90', amount: new Prisma.Decimal(0) },
      { code: '91+', name: 'أكثر من 90', amount: new Prisma.Decimal(0) },
    ];
    const lines = rows.map((row) => {
      const basis = row.dueDate ?? row.documentDate;
      const days = Math.max(0, Math.round((date.getTime() - basis.getTime()) / 86400000));
      const bucket = days <= 30 ? buckets[0] : days <= 60 ? buckets[1] : days <= 90 ? buckets[2] : buckets[3];
      bucket.amount = bucket.amount.plus(row.remaining);
      return {
        ...presentItem(row),
        days,
        bucket: bucket.code,
      };
    });
    const total = rows.reduce((sum, row) => sum.plus(row.remaining), new Prisma.Decimal(0));
    return {
      asOf: iso(date),
      gross: true,
      lines,
      buckets: buckets.map((bucket) => ({ code: bucket.code, name: bucket.name, amount: money(bucket.amount) })),
      total: money(total),
    };
  }

  async collect(actor: AuthUser, id: string, dto: CollectOpenItemDto) {
    const item = await this.prisma.openItem.findFirst({ where: { id, companyId: this.companyId } });
    if (!item) throw new NotFoundException('OPEN_ITEM_NOT_FOUND');
    if (item.kind !== OpenItemKind.RECEIVABLE && item.kind !== OpenItemKind.PAYABLE) {
      throw new BadRequestException('OPEN_ITEM_KIND');
    }
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.gt(item.remaining)) throw new BadRequestException('OVER_ALLOCATE');
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    const show = item.kind === OpenItemKind.RECEIVABLE ? 'INCOME' : 'OUTCOME';
    if (!project || !project.showIn.includes(show)) throw new BadRequestException(show === 'INCOME' ? 'PROJECT_NOT_FOR_INCOME' : 'PROJECT_NOT_FOR_OUTCOME');
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
    const cashCode = fundAccount(fund);
    const control = item.kind === OpenItemKind.RECEIVABLE ? '1200' : '2100';
    return this.prisma.$transaction(async (tx) => {
      const date = parseDate(dto.transactionDate);
      const functional = await functionalCurrency(tx, this.companyId);
      const settlementFxRate = await foreignOperationRate(tx, this.companyId, item.currency, undefined, { date });
      const fx = buildSettlementFxJournal({
        kind: item.kind,
        currency: item.currency,
        functional,
        amount,
        originalFxRate: item.fxRate,
        settlementFxRate,
        cashOrOffsetCode: cashCode,
        controlCode: control,
      });
      if (item.kind === OpenItemKind.RECEIVABLE) {
        const [opAgg, count] = await Promise.all([
          tx.income.aggregate({ where: { companyId: this.companyId, employeeId: actor.id }, _max: { operationNumber: true } }),
          tx.income.count({ where: { companyId: this.companyId } }),
        ]);
        const income = await tx.income.create({
          data: {
            companyId: this.companyId,
            operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
            transactionDate: date,
            projectId: project.id,
            description: `قبض بند ${item.partyName}`,
            fund,
            bankId,
            sender: item.partyName,
            currency: item.currency,
            fxRate: settlementFxRate,
            quantity: new Prisma.Decimal(1),
            amount,
            total: amount,
            notes: (dto.notes || '').trim(),
            employeeId: actor.id,
            locationId: actor.locationId,
            status: TransactionStatus.COMPLETED,
            reference: nextReference('IN', count + 1),
          },
        });
        await allocateItem(tx, this.companyId, item.id, amount, {
          sourceType: 'INCOME',
          sourceId: income.id,
          memo: 'قبض',
          settlementFxRate,
          fxDifference: fx.fxDifference,
        });
        await postOperationJournal(tx, {
          companyId: this.companyId,
          actorId: actor.id,
          locationId: actor.locationId,
          projectId: project.id,
          transactionDate: date,
          description: `قبض ${income.reference}`,
          sourceType: 'INCOME',
          sourceId: income.id,
          lines: fx.lines,
        });
      } else {
        const [opAgg, count] = await Promise.all([
          tx.outcome.aggregate({ where: { companyId: this.companyId, employeeId: actor.id }, _max: { operationNumber: true } }),
          tx.outcome.count({ where: { companyId: this.companyId } }),
        ]);
        const outcome = await tx.outcome.create({
          data: {
            companyId: this.companyId,
            operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
            transactionDate: date,
            projectId: project.id,
            description: `دفع بند ${item.partyName}`,
            fund,
            bankId,
            receiver: item.partyName,
            currency: item.currency,
            fxRate: settlementFxRate,
            quantity: new Prisma.Decimal(1),
            amount,
            total: amount,
            notes: (dto.notes || '').trim(),
            employeeId: actor.id,
            locationId: actor.locationId,
            status: TransactionStatus.COMPLETED,
            reference: nextReference('OUT', count + 1),
          },
        });
        await allocateItem(tx, this.companyId, item.id, amount, {
          sourceType: 'OUTCOME',
          sourceId: outcome.id,
          memo: 'دفع',
          settlementFxRate,
          fxDifference: fx.fxDifference,
        });
        await postOperationJournal(tx, {
          companyId: this.companyId,
          actorId: actor.id,
          locationId: actor.locationId,
          projectId: project.id,
          transactionDate: date,
          description: `دفع ${outcome.reference}`,
          sourceType: 'OUTCOME',
          sourceId: outcome.id,
          lines: fx.lines,
        });
      }
      return presentItem(await tx.openItem.findFirstOrThrow({ where: { id: item.id }, include: includeParty }));
    });
  }

  async revaluePreview(dto: RevalueOpenItemsDto) {
    const functional = await functionalCurrency(this.prisma, this.companyId);
    const closing = dto.rate ? new Prisma.Decimal(dto.rate) : null;
    const rows = await this.prisma.openItem.findMany({
      where: { companyId: this.companyId, status: OpenItemStatus.OPEN, remaining: { gt: 0 } },
      orderBy: { documentDate: 'asc' },
    });
    const monetary = [];
    const goods = [];
    for (const row of rows) {
      const monetaryItem = isMonetaryOpenItem(row.kind, row.settlementMode);
      const presented = presentItem(row);
      if (!monetaryItem) {
        goods.push({ ...presented, gap: '0.00' });
        continue;
      }
      let gap = new Prisma.Decimal(0);
      if (row.currency !== functional && closing && row.fxRate) {
        const historical = translatedLine(
          {
            currency: row.currency,
            debit: row.kind === OpenItemKind.PAYABLE || row.kind === OpenItemKind.ADVANCE_OUT ? new Prisma.Decimal(0) : row.remaining,
            credit: row.kind === OpenItemKind.PAYABLE || row.kind === OpenItemKind.ADVANCE_OUT ? row.remaining : new Prisma.Decimal(0),
            fxRate: row.fxRate,
            account: { type: AccountType.ASSET, code: CONTROL_ACCOUNT[row.kind] },
          },
          functional,
          row.fxRate,
        );
        const atClose = translatedLine(
          {
            currency: row.currency,
            debit: row.kind === OpenItemKind.PAYABLE || row.kind === OpenItemKind.ADVANCE_OUT ? new Prisma.Decimal(0) : row.remaining,
            credit: row.kind === OpenItemKind.PAYABLE || row.kind === OpenItemKind.ADVANCE_OUT ? row.remaining : new Prisma.Decimal(0),
            fxRate: closing,
            account: { type: AccountType.ASSET, code: '9999' },
          },
          functional,
          closing,
        );
        const historicalNet = historical.debit.minus(historical.credit);
        const closeNet = atClose.debit.minus(atClose.credit);
        gap = closeNet.minus(historicalNet);
      }
      monetary.push({ ...presented, gap: money(gap) });
    }
    return { asOf: dto.asOf, functional, monetary, goods };
  }

  private async requireCustomer(id?: string) {
    if (!id) throw new BadRequestException('CUSTOMER_REQUIRED');
    const row = await this.prisma.customer.findFirst({
      where: { id, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!row) throw new BadRequestException('CUSTOMER_REQUIRED');
    return row;
  }

  private async requireSupplier(id?: string) {
    if (!id) throw new BadRequestException('SUPPLIER_REQUIRED');
    const row = await this.prisma.supplier.findFirst({
      where: { id, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!row) throw new BadRequestException('SUPPLIER_REQUIRED');
    return row;
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function presentItem(row: {
  id: string;
  party: OpenItemParty;
  customerId: string | null;
  supplierId: string | null;
  borrowerId: string | null;
  partyName: string;
  kind: OpenItemKind;
  documentDate: Date;
  dueDate: Date | null;
  currency: Currency;
  fxRate: Prisma.Decimal | null;
  originalAmount: Prisma.Decimal;
  remaining: Prisma.Decimal;
  settlementMode: SettlementMode;
  sourceType: string;
  reference: string;
  memo: string;
  status: OpenItemStatus;
}) {
  return {
    id: row.id,
    party: row.party,
    customerId: row.customerId,
    supplierId: row.supplierId,
    borrowerId: row.borrowerId,
    partyName: row.partyName,
    kind: row.kind,
    documentDate: iso(row.documentDate),
    dueDate: row.dueDate ? iso(row.dueDate) : '',
    currency: row.currency,
    fxRate: row.fxRate ? Number(row.fxRate) : null,
    originalAmount: money(row.originalAmount),
    remaining: money(row.remaining),
    settlementMode: row.settlementMode,
    sourceType: row.sourceType,
    reference: row.reference,
    memo: row.memo,
    status: row.status,
  };
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextReference(prefix: string, serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${prefix}-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
