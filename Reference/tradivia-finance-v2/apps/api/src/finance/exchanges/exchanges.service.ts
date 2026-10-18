import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency, ExchangeType, FundType, Prisma, RecordStatus, TransactionStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  canDirectlyChangeOperations,
  isGeneralManager,
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { compactPatch, exchangeUpdateData, snapshotOp } from '../audit/operation-patch';
import { requireDirectReason, writeDirectAudit } from '../audit/write-direct-audit';
import { buildExchangeJournal } from '../ledger/fx-journal';
import { fundAccount, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { convertByRate, exchangeDirection } from './exchange-math';
import { CreateExchangeDto } from './dto/exchange.dto';
import { ListExchangeQueryDto } from './dto/list-exchange.dto';

const exchangeInclude = {
  bank: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ExchangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.exchange.findMany({
      where: {
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: exchangeInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  search(actor: AuthUser, query: ListExchangeQueryDto) {
    const where: Prisma.ExchangeWhereInput = {
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
    if (query.exchangeType) where.exchangeType = query.exchangeType;
    if (query.paidCurrency) where.paidCurrency = query.paidCurrency;
    if (query.receivedCurrency) where.receivedCurrency = query.receivedCurrency;
    if (query.bankId) where.bankId = query.bankId;
    if (query.operationNumber) where.operationNumber = query.operationNumber;
    if (query.notes) where.notes = { contains: query.notes.trim(), mode: 'insensitive' };
    if (query.minTotal != null || query.maxTotal != null) {
      where.total = {
        ...(query.minTotal != null ? { gte: query.minTotal } : {}),
        ...(query.maxTotal != null ? { lte: query.maxTotal } : {}),
      };
    }
    return this.prisma.exchange.findMany({
      where,
      include: exchangeInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
  }

  async create(actor: AuthUser, dto: CreateExchangeDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const exchangeType = dto.exchangeType as ExchangeType;
    const direction = exchangeDirection(exchangeType);
    const total = convertByRate(dto.exchangeAmount, dto.exchangeRate, direction.from, direction.to);
    if (!(dto.exchangeAmount > 0 && dto.exchangeRate > 0 && total > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
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
        tx.exchange.aggregate({
          where: { companyId: this.companyId, employeeId: actor.id },
          _max: { operationNumber: true },
        }),
        tx.exchange.count({ where: { companyId: this.companyId } }),
      ]);

      const created = await tx.exchange.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          fund,
          bankId,
          exchangeType,
          paidCurrency: direction.from,
          receivedCurrency: direction.to,
          amountCurrency: direction.from,
          exchangeAmount: new Prisma.Decimal(dto.exchangeAmount.toFixed(4)),
          exchangeRate: new Prisma.Decimal(dto.exchangeRate.toFixed(6)),
          total: new Prisma.Decimal(total.toFixed(4)),
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId,
          status: TransactionStatus.COMPLETED,
          reference: nextExchangeReference(count + 1),
        },
        include: exchangeInclude,
      });
      await syncOperationJournal(tx, await buildExchangeJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        fundCode: fundAccount(created.fund),
        row: created,
      }));
      return created;
    });
  }

  async update(actor: AuthUser, id: string, dto: CreateExchangeDto, reason?: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }
    const auditReason = requireDirectReason(reason);

    const row = await this.prisma.exchange.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: exchangeInclude,
    });
    if (!row) {
      throw new NotFoundException('EXCHANGE_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const data = await exchangeUpdateData(this.prisma, this.companyId, row, dto);
    const snapshot = snapshotOp('exchange', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exchange.update({
        where: { id },
        data,
        include: exchangeInclude,
      });
      await syncOperationJournal(tx, await buildExchangeJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        fundCode: fundAccount(updated.fund),
        row: updated,
      }));
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

    const row = await this.prisma.exchange.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: exchangeInclude,
    });
    if (!row) {
      throw new NotFoundException('EXCHANGE_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const snapshot = snapshotOp('exchange', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exchange.update({
        where: { id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: exchangeInclude,
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: row.locationId,
        sourceType: 'EXCHANGE',
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
}

export { convertByRate, exchangeDirection } from './exchange-math';

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function nextExchangeReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `EX-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
