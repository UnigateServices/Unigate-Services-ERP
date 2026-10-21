import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency, FundType, Prisma, RecordStatus, SalesPaymentStatus, TransactionStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  canDirectlyChangeOperations,
  isGeneralManager,
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { compactPatch, outcomeUpdateData, snapshotOp } from '../audit/operation-patch';
import { requireDirectReason, writeDirectAudit } from '../audit/write-direct-audit';
import { fundAccount, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { foreignOperationRate } from '../ledger/fx-journal';
import { CreateOutcomeDto } from './dto/outcome.dto';
import { ListOutcomeQueryDto } from './dto/list-outcome.dto';

const outcomeInclude = {
  project: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OutcomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.outcome.findMany({
      where: {
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: outcomeInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  search(actor: AuthUser, query: ListOutcomeQueryDto) {
    const where: Prisma.OutcomeWhereInput = {
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
    if (query.fund) where.fund = query.fund;
    if (query.currency) where.currency = query.currency;
    if (query.projectId) where.projectId = query.projectId;
    if (query.bankId) where.bankId = query.bankId;
    if (query.operationNumber) where.operationNumber = query.operationNumber;
    if (query.deliverer) where.deliverer = { contains: query.deliverer.trim(), mode: 'insensitive' };
    if (query.receiver) where.receiver = { contains: query.receiver.trim(), mode: 'insensitive' };
    if (query.description) where.description = { contains: query.description.trim(), mode: 'insensitive' };
    if (query.notes) where.notes = { contains: query.notes.trim(), mode: 'insensitive' };
    if (query.minTotal != null || query.maxTotal != null) {
      where.total = {
        ...(query.minTotal != null ? { gte: query.minTotal } : {}),
        ...(query.maxTotal != null ? { lte: query.maxTotal } : {}),
      };
    }
    return this.prisma.outcome.findMany({
      where,
      include: outcomeInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
  }

  async create(actor: AuthUser, dto: CreateOutcomeDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;
    const total = roundMoney(quantity * dto.amount);
    if (total <= 0) {
      throw new BadRequestException('AMOUNT_INVALID');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!project) {
      throw new BadRequestException('PROJECT_REQUIRED');
    }
    if (!project.showIn.includes('OUTCOME')) {
      throw new BadRequestException('PROJECT_NOT_FOR_OUTCOME');
    }

    const fund = dto.fund as FundType;
    let bankId: string | null = null;
    if (fund === FundType.BANK) {
      if (!dto.bankId) {
        throw new BadRequestException('BANK_REQUIRED');
      }
      const bank = await this.prisma.bank.findFirst({
        where: { id: dto.bankId, companyId: this.companyId, status: RecordStatus.ACTIVE },
      });
      if (!bank) {
        throw new BadRequestException('BANK_REQUIRED');
      }
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

      const created = await tx.outcome.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          projectId: project.id,
          description: (dto.description || '').trim(),
          fund,
          bankId,
          deliverer: (dto.deliverer || '').trim(),
          receiver: (dto.receiver || '').trim(),
          currency: dto.currency as Currency,
          fxRate: await foreignOperationRate(
            this.prisma as Prisma.TransactionClient,
            this.companyId,
            dto.currency as Currency,
            undefined,
            { date: parseDateOnly(dto.transactionDate) },
          ),
          quantity: new Prisma.Decimal(quantity.toFixed(4)),
          amount: new Prisma.Decimal(dto.amount.toFixed(4)),
          total: new Prisma.Decimal(total.toFixed(4)),
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId,
          status: TransactionStatus.COMPLETED,
          reference: nextOutcomeReference(count + 1),
        },
        include: outcomeInclude,
      });
      await syncOperationJournal(tx, outcomeJournal(this.companyId, created, actor.id));
      return created;
    });
  }

  async update(actor: AuthUser, id: string, dto: CreateOutcomeDto, reason?: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }
    const auditReason = requireDirectReason(reason);

    const row = await this.prisma.outcome.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: outcomeInclude,
    });
    if (!row) {
      throw new NotFoundException('OUTCOME_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }
    await this.assertFreeOfInvoice(row.id);

    const data = await outcomeUpdateData(this.prisma, this.companyId, row, dto);
    const currency = (dto.currency as Currency) || row.currency;
    const txDate = dto.transactionDate ? parseDateOnly(dto.transactionDate) : row.transactionDate;
    data.fxRate = await foreignOperationRate(
      this.prisma as Prisma.TransactionClient,
      this.companyId,
      currency,
      undefined,
      { date: txDate },
    );
    const snapshot = snapshotOp('outcome', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outcome.update({
        where: { id },
        data,
        include: outcomeInclude,
      });
      await syncOperationJournal(tx, outcomeJournal(this.companyId, updated, actor.id));
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

    const row = await this.prisma.outcome.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: outcomeInclude,
    });
    if (!row) {
      throw new NotFoundException('OUTCOME_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }
    await this.assertFreeOfInvoice(row.id);

    const snapshot = snapshotOp('outcome', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outcome.update({
        where: { id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: outcomeInclude,
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: row.locationId,
        sourceType: 'OUTCOME',
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

  private async assertFreeOfInvoice(outcomeId: string) {
    const linked = await this.prisma.purchaseInvoicePayment.findFirst({
      where: { outcomeId, status: SalesPaymentStatus.POSTED },
      select: { id: true },
    });
    if (linked) throw new BadRequestException('OUTCOME_LINKED_TO_INVOICE');
  }
}

function outcomeJournal(
  companyId: string,
    row: { id: string; reference: string; transactionDate: Date; locationId: string | null; projectId: string | null; fund: FundType; currency: Currency; total: Prisma.Decimal; fxRate: Prisma.Decimal | null },
  actorId: string,
) {
  return {
    companyId,
    actorId,
    locationId: row.locationId,
    projectId: row.projectId,
    transactionDate: row.transactionDate,
    description: `صادر ${row.reference}`,
    sourceType: 'OUTCOME',
    sourceId: row.id,
    lines: [
      { code: '5200', currency: row.currency, debit: row.total, credit: 0, fxRate: row.fxRate },
      { code: fundAccount(row.fund), currency: row.currency, debit: 0, credit: row.total, fxRate: row.fxRate },
    ],
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function nextOutcomeReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `OUT-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
