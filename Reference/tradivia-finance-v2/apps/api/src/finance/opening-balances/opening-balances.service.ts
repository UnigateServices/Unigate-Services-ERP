import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency, FundType, Prisma, RecordStatus, TransactionStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import {
  canDirectlyChangeOperations,
  isGeneralManager,
  locationWhere,
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { fundAccount, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { foreignOperationRate } from '../ledger/fx-journal';
import { CreateOpeningBalanceDto } from './dto/opening-balance.dto';
import { ListOpeningQueryDto } from './dto/list-opening.dto';

const openingInclude = {
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.openingBalance.findMany({
      where: {
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: openingInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  search(actor: AuthUser, query: ListOpeningQueryDto) {
    const where: Prisma.OpeningBalanceWhereInput = {
      companyId: this.companyId,
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
    return this.prisma.openingBalance.findMany({
      where,
      include: openingInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
  }

  async create(actor: AuthUser, dto: CreateOpeningBalanceDto) {
    if (!Number.isFinite(dto.amount) || dto.amount === 0) {
      throw new BadRequestException('AMOUNT_INVALID');
    }

    const target = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        companyId: this.companyId,
        accountStatus: RecordStatus.ACTIVE,
        ...locationWhere(actor),
      },
    });
    if (!target) {
      throw new BadRequestException('EMPLOYEE_NOT_FOUND');
    }

    const locationId = target.locationId;
    if (!isGeneralManager(actor) && !locationId) {
      throw new ForbiddenException('LOCATION_REQUIRED');
    }

    const fxRate = await foreignOperationRate(
      this.prisma as Prisma.TransactionClient,
      this.companyId,
      dto.currency as Currency,
      dto.fxRate,
    );

    return this.prisma.$transaction(async (tx) => {
      const [opAgg, count] = await Promise.all([
        tx.openingBalance.aggregate({
          where: { companyId: this.companyId, employeeId: target.id },
          _max: { operationNumber: true },
        }),
        tx.openingBalance.count({ where: { companyId: this.companyId } }),
      ]);

      const created = await tx.openingBalance.create({
        data: {
          companyId: this.companyId,
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
      await syncOperationJournal(tx, openingJournal(this.companyId, created, actor.id));
      return created;
    });
  }

  async remove(actor: AuthUser, id: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }

    const row = await this.prisma.openingBalance.findFirst({
      where: {
        id,
        companyId: this.companyId,
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
        where: { id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: openingInclude,
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: row.locationId,
        sourceType: 'OPENING',
        sourceId: row.id,
      });
      return updated;
    });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function openingJournal(
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
