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
  operationListWhere,
} from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { compactPatch, snapshotOp, transferUpdateData } from '../audit/operation-patch';
import { requireDirectReason, writeDirectAudit } from '../audit/write-direct-audit';
import { foreignOperationRate } from '../ledger/fx-journal';
import { fundAccount, reverseOperationJournal, syncOperationJournal } from '../ledger/post-source';
import { isSameFundTransfer } from './transfer-rules';
import { ListTransferQueryDto } from './dto/list-transfer.dto';
import { CreateTransferDto } from './dto/transfer.dto';

const transferInclude = {
  fromBank: { select: { id: true, name: true } },
  toBank: { select: { id: true, name: true } },
  borrower: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.transfer.findMany({
      where: {
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: transferInclude,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  search(actor: AuthUser, query: ListTransferQueryDto) {
    const where: Prisma.TransferWhereInput = {
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
    if (query.fromFund) where.fromFund = query.fromFund;
    if (query.toFund) where.toFund = query.toFund;
    if (query.currency) where.currency = query.currency;
    if (query.fromBankId) where.fromBankId = query.fromBankId;
    if (query.toBankId) where.toBankId = query.toBankId;
    if (query.borrowerId) where.borrowerId = query.borrowerId;
    if (query.operationNumber) where.operationNumber = query.operationNumber;
    if (query.notes) where.notes = { contains: query.notes.trim(), mode: 'insensitive' };
    if (query.minAmount != null || query.maxAmount != null) {
      where.amount = {
        ...(query.minAmount != null ? { gte: query.minAmount } : {}),
        ...(query.maxAmount != null ? { lte: query.maxAmount } : {}),
      };
    }
    return this.prisma.transfer.findMany({
      where,
      include: transferInclude,
      orderBy: [{ transactionDate: 'desc' }, { operationNumber: 'desc' }],
      take: 500,
    });
  }

  async create(actor: AuthUser, dto: CreateTransferDto) {
    const locationId = await this.resolveLocationId(actor, dto.locationId);
    const fromFund = dto.fromFund as FundType;
    const toFund = dto.toFund as FundType;

    if (!(dto.amount > 0)) {
      throw new BadRequestException('AMOUNT_INVALID');
    }

    const fromBankId = fromFund === FundType.BANK ? await this.requireBank(dto.fromBankId) : null;
    const toBankId = toFund === FundType.BANK ? await this.requireBank(dto.toBankId) : null;

    if (isSameFundTransfer(fromFund, toFund, fromBankId, toBankId)) {
      throw new BadRequestException('SAME_FUND');
    }

    const involvesAdvances = fromFund === FundType.ADVANCES || toFund === FundType.ADVANCES;
    const borrowerId = involvesAdvances ? await this.requireBorrower(dto.borrowerId) : null;
    const fxRate = await foreignOperationRate(
      this.prisma as Prisma.TransactionClient,
      this.companyId,
      dto.currency as Currency,
      dto.fxRate,
    );

    return this.prisma.$transaction(async (tx) => {
      const [opAgg, count] = await Promise.all([
        tx.transfer.aggregate({
          where: { companyId: this.companyId, employeeId: actor.id },
          _max: { operationNumber: true },
        }),
        tx.transfer.count({ where: { companyId: this.companyId } }),
      ]);

      const created = await tx.transfer.create({
        data: {
          companyId: this.companyId,
          operationNumber: (opAgg._max.operationNumber ?? 0) + 1,
          transactionDate: parseDateOnly(dto.transactionDate),
          fromFund,
          toFund,
          fromBankId,
          toBankId,
          currency: dto.currency as Currency,
          fxRate,
          amount: new Prisma.Decimal(dto.amount.toFixed(4)),
          borrowerId,
          notes: (dto.notes || '').trim(),
          employeeId: actor.id,
          locationId,
          status: TransactionStatus.COMPLETED,
          reference: nextTransferReference(count + 1),
        },
        include: transferInclude,
      });
      await syncOperationJournal(tx, transferJournal(this.companyId, created, actor.id));
      return created;
    });
  }

  async update(actor: AuthUser, id: string, dto: CreateTransferDto, reason?: string) {
    if (!canDirectlyChangeOperations(actor)) {
      throw new ForbiddenException('APPROVAL_REQUIRED');
    }
    const auditReason = requireDirectReason(reason);

    const row = await this.prisma.transfer.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: transferInclude,
    });
    if (!row) {
      throw new NotFoundException('TRANSFER_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const data = await transferUpdateData(this.prisma, this.companyId, row, dto);
    const snapshot = snapshotOp('transfer', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id },
        data,
        include: transferInclude,
      });
      await syncOperationJournal(tx, transferJournal(this.companyId, updated, actor.id));
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

    const row = await this.prisma.transfer.findFirst({
      where: {
        id,
        companyId: this.companyId,
        status: { not: TransactionStatus.DELETED },
        ...operationListWhere(actor),
      },
      include: transferInclude,
    });
    if (!row) {
      throw new NotFoundException('TRANSFER_NOT_FOUND');
    }
    if (row.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }

    const snapshot = snapshotOp('transfer', row as unknown as Record<string, unknown>);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id },
        data: { status: TransactionStatus.DELETED, deletedAt: new Date() },
        include: transferInclude,
      });
      await reverseOperationJournal(tx, {
        companyId: this.companyId,
        actorId: actor.id,
        locationId: row.locationId,
        sourceType: 'TRANSFER',
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

  private async requireBank(id?: string) {
    if (!id) {
      throw new BadRequestException('BANK_REQUIRED');
    }
    const bank = await this.prisma.bank.findFirst({
      where: { id, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!bank) {
      throw new BadRequestException('BANK_REQUIRED');
    }
    return bank.id;
  }

  private async requireBorrower(id?: string) {
    if (!id) {
      throw new BadRequestException('BORROWER_REQUIRED');
    }
    const borrower = await this.prisma.borrower.findFirst({
      where: { id, companyId: this.companyId, status: RecordStatus.ACTIVE },
    });
    if (!borrower) {
      throw new BadRequestException('BORROWER_REQUIRED');
    }
    return borrower.id;
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

export { isSameFundTransfer } from './transfer-rules';

function transferJournal(
  companyId: string,
  row: {
    id: string;
    reference: string;
    transactionDate: Date;
    locationId: string | null;
    fromFund: FundType;
    toFund: FundType;
    currency: Currency;
    amount: Prisma.Decimal;
    fxRate: Prisma.Decimal | null;
  },
  actorId: string,
) {
  return {
    companyId,
    actorId,
    locationId: row.locationId,
    transactionDate: row.transactionDate,
    description: `تحويل ${row.reference}`,
    sourceType: 'TRANSFER',
    sourceId: row.id,
    lines: [
      { code: fundAccount(row.toFund), currency: row.currency, debit: row.amount, credit: 0, fxRate: row.fxRate },
      { code: fundAccount(row.fromFund), currency: row.currency, debit: 0, credit: row.amount, fxRate: row.fxRate },
    ],
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function nextTransferReference(serial: number) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `TR-${yy}${mm}${dd}-${String(serial).padStart(3, '0')}`;
}
