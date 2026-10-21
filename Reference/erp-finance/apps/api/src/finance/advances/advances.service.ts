import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdvanceType, Currency, FundType, Prisma, RecordStatus, TransactionStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  canDirectlyChangeOperations,
  isGeneralManager,
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { convertByRate } from '../exchanges/exchange-math';
import { compactPatch, advanceUpdateData, snapshotOp } from '../audit/operation-patch';
import { requireDirectReason, writeDirectAudit } from '../audit/write-direct-audit';
import { operationJournalForAdvance, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { foreignOperationRate } from '../ledger/fx-journal';
import { applyCustody, releaseCustody, syncCustody } from './custody-book';
import { CreateAdvanceDto } from './dto/advance.dto';
import { ListAdvanceQueryDto } from './dto/list-advance.dto';

const advanceInclude = {
  borrower: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.advance.findMany({
      where: {
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: advanceInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  search(actor: AuthUser, query: ListAdvanceQueryDto) {
    const where: Prisma.AdvanceWhereInput = {
      companyId: this.companyId,
      status: query.status ?? { not: TransactionStatus.DELETED },
      ...operationListWhere(actor),
    };
    if (query.from || query.to) {
      where.transactionDate = {
        ...(query.from ? { gte: parseDateOnly(query.from) } : {}),
        ...(query.to ? { lte: parseDateOnly(query.to) } : {}),
      };
    }
    if (query.advanceType) where.advanceType = query.advanceType;
    if (query.currency) where.currency = query.currency;
    if (query.projectId) where.projectId = query.projectId;
    if (query.borrowerId) where.borrowerId = query.borrowerId;
    if (query.operationNumber) where.operationNumber = query.operationNumber;
    if (query.receiver) where.receiver = { contains: query.receiver.trim(), mode: 'insensitive' };
    if (query.description) where.description = { contains: query.description.trim(), mode: 'insensitive' };
    if (query.notes) where.notes = { contains: query.notes.trim(), mode: 'insensitive' };
    if (query.minTotal != null || query.maxTotal != null) {
      where.total = {
        ...(query.minTotal != null ? { gte: query.minTotal } : {}),
        ...(query.maxTotal != null ? { lte: query.maxTotal } : {}),
      };
    }
    return this.prisma.advance.findMany({
      where,
      include: advanceInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
  }

  async create(actor: AuthUser, dto: CreateAdvanceDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const borrower = await this.prisma.borrower.findFirst({
      where: { id: dto.borrowerId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!borrower) {
      throw new BadRequestException('BORROWER_REQUIRED');
    }

    const advanceType = dto.advanceType as AdvanceType;
    const payload =
      advanceType === AdvanceType.EXCHANGE
        ? this.exchangePayload(dto)
        : advanceType === AdvanceType.ISSUE || advanceType === AdvanceType.RETURN
          ? await this.cashPayload(dto)
          : await this.outcomePayload(dto);

    return this.prisma.$transaction(async (tx) => {
      const [opAgg, count] = await Promise.all([
        tx.advance.aggregate({
          where: { companyId: this.companyId, employeeId: actor.id },
          _max: { operationNumber: true },
        }),
        tx.advance.count({ where: { companyId: this.companyId } }),
      ]);

      const created = await tx.advance.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          borrowerId: borrower.id,
          advanceType,
          ...payload,
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId,
          status: TransactionStatus.COMPLETED,
          reference: nextAdvanceReference(count + 1),
        },
        include: advanceInclude,
      });
      await applyCustody(tx, this.companyId, created);
      await syncOperationJournal(tx, await operationJournalForAdvance(tx, this.companyId, actor.id, created));
      return created;
    });
  }

  async update(actor: AuthUser, id: string, dto: CreateAdvanceDto, reason?: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }
    const auditReason = requireDirectReason(reason);

    const row = await this.prisma.advance.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: advanceInclude,
    });
    if (!row) {
      throw new NotFoundException('ADVANCE_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const data = await advanceUpdateData(this.prisma, this.companyId, row, dto);
    const snapshot = snapshotOp('advance', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.advance.update({
        where: { id },
        data,
        include: advanceInclude,
      });
      await syncCustody(tx, this.companyId, updated);
      await syncOperationJournal(tx, await operationJournalForAdvance(tx, this.companyId, actor.id, updated));
      await writeDirectAudit(tx, {
        companyId: this.companyId,
        actor,
        reference: row.reference,
        locationId: row.locationId,
        actionType: 'UPDATE',
        oldDetails: snapshot,
        newDetails: compactPatch(dto),
        reason: auditReason,
      });
      return updated;
    });
  }

  async remove(actor: AuthUser, id: string, reason?: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }
    const auditReason = requireDirectReason(reason);

    const row = await this.prisma.advance.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: advanceInclude,
    });
    if (!row) {
      throw new NotFoundException('ADVANCE_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const snapshot = snapshotOp('advance', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.advance.update({
        where: { id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: advanceInclude,
      });
      await releaseCustody(tx, this.companyId, row.id);
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: row.locationId,
        sourceType: 'ADVANCE',
        sourceId: row.id,
      });
      await writeDirectAudit(tx, {
        companyId: this.companyId,
        actor,
        reference: row.reference,
        locationId: row.locationId,
        actionType: 'DELETE',
        oldDetails: snapshot,
        newDetails: {},
        reason: auditReason,
      });
      return updated;
    });
  }

  private async outcomePayload(dto: CreateAdvanceDto) {
    if (!dto.currency) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;
    const total = roundMoney(quantity * dto.amount);
    if (total <= 0) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    if (!dto.projectId) {
      throw new BadRequestException('PROJECT_REQUIRED');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!project) {
      throw new BadRequestException('PROJECT_REQUIRED');
    }
    if (!project.showIn.includes('LOANS')) {
      throw new BadRequestException('PROJECT_NOT_FOR_LOANS');
    }

    return {
      projectId: project.id,
      description: (dto.description || '').trim(),
      receiver: (dto.receiver || '').trim(),
      currency: dto.currency as Currency,
      quantity: new Prisma.Decimal(quantity.toFixed(4)),
      amount: new Prisma.Decimal(dto.amount.toFixed(4)),
      total: new Prisma.Decimal(total.toFixed(4)),
      exchangeRate: await foreignOperationRate(
        this.prisma as Prisma.TransactionClient,
        this.companyId,
        dto.currency as Currency,
        undefined,
        { date: parseDateOnly(dto.transactionDate) },
      ),
      fromCurrency: null,
      toCurrency: null,
      fund: null,
      bankId: null,
    };
  }

  /** ISSUE and RETURN vouchers are the only advances that touch a cash fund. */
  private async cashPayload(dto: CreateAdvanceDto) {
    if (!dto.fund) {
      throw new BadRequestException('FUNDS_REQUIRED');
    }
    if (!dto.currency || !(dto.amount > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    const fund = dto.fund as FundType;
    let bankId: string | null = null;
    if (fund === FundType.BANK) {
      const bank = dto.bankId
        ? await this.prisma.bank.findFirst({
            where: { id: dto.bankId, companyId: this.companyId, status: RecordStatus.ACTIVE },
          })
        : null;
      if (!bank) {
        throw new BadRequestException('BANK_REQUIRED');
      }
      bankId = bank.id;
    }
    const total = roundMoney(dto.amount);
    return {
      projectId: null,
      description: (dto.description || '').trim(),
      receiver: (dto.receiver || '').trim(),
      currency: dto.currency as Currency,
      quantity: null,
      amount: new Prisma.Decimal(total.toFixed(4)),
      total: new Prisma.Decimal(total.toFixed(4)),
      exchangeRate: await foreignOperationRate(
        this.prisma as Prisma.TransactionClient,
        this.companyId,
        dto.currency as Currency,
        undefined,
        { date: parseDateOnly(dto.transactionDate) },
      ),
      fromCurrency: null,
      toCurrency: null,
      fund,
      bankId,
    };
  }

  private exchangePayload(dto: CreateAdvanceDto) {
    if (!dto.fromCurrency || !dto.toCurrency) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('SAME_CURRENCY');
    }
    if (!(dto.exchangeRate && dto.exchangeRate > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }
    const from = dto.fromCurrency as Currency;
    const to = dto.toCurrency as Currency;
    const total = convertByRate(dto.amount, dto.exchangeRate, from, to);
    if (!(dto.amount > 0 && total > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }

    return {
      projectId: null,
      description: '',
      receiver: '',
      currency: from,
      quantity: null,
      amount: new Prisma.Decimal(dto.amount.toFixed(4)),
      exchangeRate: new Prisma.Decimal(dto.exchangeRate.toFixed(6)),
      total: new Prisma.Decimal(total.toFixed(4)),
      fromCurrency: from,
      toCurrency: to,
      fund: null,
      bankId: null,
    };
  }

  private async resolveLocationId(actor: AuthUser, requested?: string) {
    if (isGeneralManager(actor)) {
      if (!requested) {
        throw new BadRequestException('LOCATION_REQUIRED');
      }
      const location = await this.prisma.location.findFirst({
        where: { id: requested, companyId: this.companyId, status: RecordStatus.ACTIVE },
      });
      if (!location) {
        throw new BadRequestException('LOCATION_REQUIRED');
      }
      return location.id;
    }
    if (!actor.locationId) {
      throw new ForbiddenException('LOCATION_REQUIRED');
    }
    return actor.locationId;
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function nextAdvanceReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `AD-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
