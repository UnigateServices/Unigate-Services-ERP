import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Currency, FundType, Prisma, TransactionStatus, UserStatus } from '@prisma/client';
import {
  actorId,
  canDirectlyDelete,
  isFinanceAdmin,
  locationWhere,
  operationListWhere,
  type FinanceActor,
} from '../finance-access';
import { personRef, withNames } from '../people';
import { PrismaService } from '../../prisma/prisma.service';
import { fundAccount, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { foreignOperationRate } from '../ledger/fx-journal';
import { CreateOpeningBalanceDto } from './dto/opening-balance.dto';
import { ListOpeningQueryDto } from './dto/list-opening.dto';

const openingInclude = {
  employee: personRef,
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OpeningBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: FinanceActor) {
    const rows = await this.prisma.openingBalance.findMany({
      where: {
        companyId: actor.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: openingInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(withNames);
  }

  async search(actor: FinanceActor, query: ListOpeningQueryDto) {
    const where: Prisma.OpeningBalanceWhereInput = {
      companyId: actor.companyId,
      status: { not: TransactionStatus.DELETED },
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
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.notes) where.notes = { contains: query.notes.trim(), mode: 'insensitive' };
    if (query.operationNumber) where.operationNumber = query.operationNumber;
    if (query.minAmount != null || query.maxAmount != null) {
      where.amount = {
        ...(query.minAmount != null ? { gte: query.minAmount } : {}),
        ...(query.maxAmount != null ? { lte: query.maxAmount } : {}),
      };
    }
    const rows = await this.prisma.openingBalance.findMany({
      where,
      include: openingInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
    return rows.map(withNames);
  }

  async create(actor: FinanceActor, dto: CreateOpeningBalanceDto) {
    const companyId = actor.companyId;
    if (!Number.isFinite(dto.amount) || dto.amount === 0) {
      throw new BadRequestException('AMOUNT_INVALID');
    }

    const policy = await this.prisma.accountingPolicy.findUnique({ where: { companyId } });
    if (policy?.openingLocked) throw new BadRequestException('OPENING_LOCKED');

    const target = await this.prisma.membership.findFirst({
      where: {
        id: dto.employeeId,
        companyId,
        user: { status: UserStatus.ACTIVE },
        ...locationWhere(actor),
      },
    });
    if (!target) {
      throw new BadRequestException('EMPLOYEE_NOT_FOUND');
    }

    const locationId = target.locationId;
    if (!isFinanceAdmin(actor) && !locationId) {
      throw new ForbiddenException('LOCATION_REQUIRED');
    }

    const fxRate = await foreignOperationRate(
      this.prisma as Prisma.TransactionClient,
      companyId,
      dto.currency as Currency,
      undefined,
      { date: parseDateOnly(dto.transactionDate) },
    );

    return this.prisma.$transaction(async (tx) => {
      const [opAgg, count] = await Promise.all([
        tx.openingBalance.aggregate({
          where: { companyId, employeeId: target.id },
          _max: { operationNumber: true },
        }),
        tx.openingBalance.count({ where: { companyId } }),
      ]);

      const created = await tx.openingBalance.create({
        data: {
          companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          fund: dto.fund as FundType,
          currency: dto.currency as Currency,
          fxRate,
          amount: new Prisma.Decimal(dto.amount.toFixed(4)),
          notes: (dto.notes || '').trim(),
          employeeId: target.id,
          locationId,
          status: TransactionStatus.COMPLETED,
          reference: nextOpeningReference(count + 1),
        },
        include: openingInclude,
      });
      await syncOperationJournal(tx, openingJournal(companyId, created, actorId(actor)));
      return withNames(created);
    });
  }

  async remove(actor: FinanceActor, id: string) {
    const companyId = actor.companyId;
    if (!canDirectlyDelete(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }

    const row = await this.prisma.openingBalance.findFirst({
      where: {
        id,
        companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
    });
    if (!row) {
      throw new NotFoundException('OPENING_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.openingBalance.update({
        where: { companyId_id: { companyId, id } },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: openingInclude,
      });
      await reverseOperationJournal(tx, {
        companyId,
        actorId: actorId(actor),
        locationId: row.locationId,
        sourceType: 'OPENING',
        sourceId: row.id,
      });
      return withNames(updated);
    });
  }
}

export function openingJournal(
  companyId: string,
  row: {
    id: string;
    reference: string;
    transactionDate: Date;
    locationId: string | null;
    fund: FundType;
    currency: Currency;
    amount: Prisma.Decimal;
    fxRate: Prisma.Decimal | null;
  },
  actorId: string,
) {
  const amount = row.amount.abs();
  const cash = { code: fundAccount(row.fund), currency: row.currency, fxRate: row.fxRate };
  const capital = { code: '3100', currency: row.currency, fxRate: row.fxRate };
  const lines = row.amount.gt(0)
    ? [
        { ...cash, debit: amount, credit: 0 },
        { ...capital, debit: 0, credit: amount },
      ]
    : [
        { ...capital, debit: amount, credit: 0 },
        { ...cash, debit: 0, credit: amount },
      ];
  return {
    companyId,
    actorId,
    locationId: row.locationId,
    transactionDate: row.transactionDate,
    description: `رصيد افتتاحي ${row.reference}`,
    sourceType: 'OPENING',
    sourceId: row.id,
    lines,
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function nextOpeningReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `OB-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
