import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Advance,
  AuditActionType,
  AuditRequestStatus,
  Exchange,
  Income,
  Outcome,
  Prisma,
  RecordStatus,
  Role,
  SalesPaymentStatus,
  TransactionStatus,
  Transfer,
} from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { locationWhere } from '../../auth/access';
import { PrismaService } from '../../prisma/prisma.service';
import { reverseLiveOperation, syncLiveOperation } from '../ledger/post-source';
import { CreateAuditRequestDto } from './dto/create-audit-request.dto';
import {
  OpKind,
  applyOperationPatch,
  asPatch,
  compactPatch,
  snapshotOp,
  validateOperationPatch,
} from './operation-patch';

const auditInclude = {
  requester: { select: { id: true, name: true } },
  supervisor: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

type LiveRecord = Income | Outcome | Exchange | Transfer | Advance;

type OpRow = {
  kind: OpKind;
  id: string;
  reference: string;
  status: TransactionStatus;
  employeeId: string;
  locationId: string | null;
  snapshot: Prisma.InputJsonValue;
  record: LiveRecord;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser, status?: AuditRequestStatus) {
    return this.prisma.auditTrail.findMany({
      where: {
        companyId: this.companyId,
        ...(status ? { requestStatus: status } : {}),
        ...(actor.role === 'EMPLOYEE' ? { requesterId: actor.id } : locationWhere(actor)),
      },
      include: auditInclude,
      orderBy: [{ requestedAt: 'desc' }],
      take: 200,
    });
  }

  history(actor: AuthUser) {
    return this.prisma.auditTrail.findMany({
      where: {
        companyId: this.companyId,
        requestStatus: { in: [AuditRequestStatus.APPROVED, AuditRequestStatus.REJECTED, AuditRequestStatus.DIRECT] },
        ...locationWhere(actor),
      },
      include: auditInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 400,
    });
  }

  async createRequest(actor: AuthUser, dto: CreateAuditRequestDto) {
    if (actor.role === 'GENERAL_MANAGER') {
      throw new ForbiddenException('USE_DIRECT_ACTION');
    }
    if (actor.role === 'MONITOR') {
      throw new ForbiddenException('FORBIDDEN');
    }

    const op = await this.findLiveOp(dto.reference);
    if (!op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }
    if (op.employeeId !== actor.id) {
      throw new ForbiddenException('FORBIDDEN');
    }
    if (op.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }
    if (op.kind === 'income') await this.assertIncomeFree(op.id);
    if (op.kind === 'outcome') await this.assertOutcomeFree(op.id);

    const pending = await this.prisma.auditTrail.findFirst({
      where: {
        companyId: this.companyId,
        originalReference: op.reference,
        requestStatus: AuditRequestStatus.PENDING,
      },
    });
    if (pending) {
      throw new BadRequestException('REQUEST_PENDING');
    }

    const actionType = dto.actionType === 'UPDATE' ? AuditActionType.UPDATE : AuditActionType.DELETE;
    let newDetails: Prisma.InputJsonValue = {};
    if (actionType === AuditActionType.UPDATE) {
      if (!dto.patch) {
        throw new BadRequestException('PATCH_REQUIRED');
      }
      await validateOperationPatch(this.prisma, op.kind, op.record, this.companyId, dto.patch);
      newDetails = compactPatch(dto.patch);
    }

    const actionLabel = actionType === AuditActionType.DELETE ? 'حذف' : 'تعديل';

    return this.prisma.$transaction(async (tx) => {
      await this.setOpStatus(tx, op, TransactionStatus.PENDING_APPROVAL);

      const audit = await tx.auditTrail.create({
        data: {
          id: nextRequestId(),
          companyId: this.companyId,
          originalReference: op.reference,
          requesterId: actor.id,
          actionType,
          oldDetails: op.snapshot,
          newDetails,
          requestStatus: AuditRequestStatus.PENDING,
          reason: (dto.reason || '').trim(),
          locationId: op.locationId,
        },
        include: auditInclude,
      });

      const approvers = await tx.employee.findMany({
        where: {
          companyId: this.companyId,
          accountStatus: RecordStatus.ACTIVE,
          role: actor.role === 'SUPERVISOR' ? Role.GENERAL_MANAGER : Role.SUPERVISOR,
          ...(actor.role === 'EMPLOYEE' && op.locationId ? { locationId: op.locationId } : {}),
        },
        select: { id: true },
      });

      const opNo = (op.record as { operationNumber?: number }).operationNumber;
      const opLabel = opNo ? `رقم ${opNo}` : '';
      const recipients = new Set<string>([actor.id, ...approvers.map((row) => row.id)]);
      await tx.notification.createMany({
        data: [...recipients].map((employeeId) => ({
          companyId: this.companyId,
          employeeId,
          message:
            employeeId === actor.id
              ? `تم إرسال طلب ${actionLabel} للعملية ${opLabel}`
              : `طلب ${actionLabel} للعملية ${opLabel} من ${audit.requester.name}`,
          section: 'pending',
          requestId: audit.id,
          actionType,
          reference: op.reference,
          requesterId: actor.id,
          locationId: op.locationId,
        })),
      });

      return audit;
    });
  }

  async decide(actor: AuthUser, id: string, decision: 'APPROVE' | 'REJECT') {
    if (actor.role !== 'GENERAL_MANAGER' && actor.role !== 'SUPERVISOR') {
      throw new ForbiddenException('FORBIDDEN');
    }

    const audit = await this.prisma.auditTrail.findFirst({
      where: {
        id,
        companyId: this.companyId,
        ...locationWhere(actor),
      },
      include: auditInclude,
    });
    if (!audit) {
      throw new NotFoundException('AUDIT_NOT_FOUND');
    }
    if (audit.requestStatus !== AuditRequestStatus.PENDING) {
      throw new BadRequestException('ALREADY_DECIDED');
    }
    if (actor.role === 'SUPERVISOR') {
      const requester = await this.prisma.employee.findFirst({
        where: { id: audit.requesterId, companyId: this.companyId },
        select: { role: true },
      });
      if (requester?.role !== Role.EMPLOYEE) {
        throw new ForbiddenException('FORBIDDEN');
      }
    }

    const op = await this.findLiveOp(audit.originalReference);
    if (decision === 'APPROVE' && !op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }

    const approved = decision === 'APPROVE';

    return this.prisma.$transaction(async (tx) => {
      if (op) {
        if (approved && audit.actionType === AuditActionType.DELETE) {
          if (op.kind === 'income') await this.assertIncomeFree(op.id);
          if (op.kind === 'outcome') await this.assertOutcomeFree(op.id);
          await this.setOpStatus(tx, op, TransactionStatus.DELETED, new Date());
          await reverseLiveOperation(tx, this.companyId, actor.id, op.kind, op.id, op.locationId);
        } else if (approved && audit.actionType === AuditActionType.UPDATE) {
          if (op.kind === 'income') await this.assertIncomeFree(op.id);
          if (op.kind === 'outcome') await this.assertOutcomeFree(op.id);
          await applyOperationPatch(
            tx,
            op.kind,
            op.id,
            op.record,
            this.companyId,
            asPatch(audit.newDetails),
          );
          await this.setOpStatus(tx, op, TransactionStatus.COMPLETED);
          await syncLiveOperation(tx, this.companyId, actor.id, op.kind, op.id);
        } else {
          await this.setOpStatus(tx, op, TransactionStatus.COMPLETED);
        }
      }

      const updated = await tx.auditTrail.update({
        where: { id: audit.id },
        data: {
          requestStatus: approved ? AuditRequestStatus.APPROVED : AuditRequestStatus.REJECTED,
          supervisorId: actor.id,
          supervisorDecision: approved ? 'موافقة' : 'رفض',
        },
        include: auditInclude,
      });

      await tx.notification.deleteMany({
        where: { companyId: this.companyId, requestId: audit.id, section: 'pending' },
      });

      const recipients = new Set<string>([audit.requesterId, actor.id]);
      const actionLabel = audit.actionType === AuditActionType.DELETE ? 'حذف' : 'تعديل';
      const storedNumber = (audit.oldDetails as { operationNumber?: number } | null)?.operationNumber;
      const opLabel = storedNumber ? `رقم ${storedNumber}` : '';
      await tx.notification.createMany({
        data: [...recipients].map((employeeId) => ({
          companyId: this.companyId,
          employeeId,
          message: approved
            ? employeeId === actor.id
              ? `وافقتَ على طلب ${actionLabel} للعملية ${opLabel}`
              : `تمت الموافقة على طلب ${actionLabel} للعملية ${opLabel}`
            : employeeId === actor.id
              ? `رفضتَ طلب ${actionLabel} للعملية ${opLabel}`
              : `تم رفض طلب ${actionLabel} للعملية ${opLabel}`,
          section: approved ? 'approved' : 'rejected',
          requestId: audit.id,
          actionType: audit.actionType,
          reference: audit.originalReference,
          requesterId: audit.requesterId,
          locationId: audit.locationId,
        })),
      });

      return updated;
    });
  }

  private async assertOutcomeFree(outcomeId: string) {
    const linked = await this.prisma.purchaseInvoicePayment.findFirst({
      where: { outcomeId, status: SalesPaymentStatus.POSTED },
      select: { id: true },
    });
    if (linked) throw new BadRequestException('OUTCOME_LINKED_TO_INVOICE');
  }

  private async assertIncomeFree(incomeId: string) {
    const linked = await this.prisma.salesInvoicePayment.findFirst({
      where: { incomeId, status: SalesPaymentStatus.POSTED },
      select: { id: true },
    });
    if (linked) throw new BadRequestException('INCOME_LINKED_TO_INVOICE');
  }

  private async findLiveOp(reference: string): Promise<OpRow | null> {
    const ref = reference.trim();
    const where = {
      companyId: this.companyId,
      reference: ref,
      status: { not: TransactionStatus.DELETED },
    };
    const income = await this.prisma.income.findFirst({
      where,
      include: { project: { select: { name: true } }, bank: { select: { name: true } } },
    });
    if (income) return toOp('income', income);
    const outcome = await this.prisma.outcome.findFirst({
      where,
      include: { project: { select: { name: true } }, bank: { select: { name: true } } },
    });
    if (outcome) return toOp('outcome', outcome);
    const exchange = await this.prisma.exchange.findFirst({
      where,
      include: { bank: { select: { name: true } } },
    });
    if (exchange) return toOp('exchange', exchange);
    const transfer = await this.prisma.transfer.findFirst({
      where,
      include: {
        fromBank: { select: { name: true } },
        toBank: { select: { name: true } },
        borrower: { select: { name: true } },
      },
    });
    if (transfer) return toOp('transfer', transfer);
    const advance = await this.prisma.advance.findFirst({
      where,
      include: { borrower: { select: { name: true } }, project: { select: { name: true } } },
    });
    if (advance) return toOp('advance', advance);
    return null;
  }

  private setOpStatus(
    tx: Prisma.TransactionClient,
    op: OpRow,
    status: TransactionStatus,
    deletedAt?: Date | null,
  ) {
    const data = { status, deletedAt: deletedAt ?? null };
    if (op.kind === 'income') return tx.income.update({ where: { id: op.id }, data });
    if (op.kind === 'outcome') return tx.outcome.update({ where: { id: op.id }, data });
    if (op.kind === 'exchange') return tx.exchange.update({ where: { id: op.id }, data });
    if (op.kind === 'transfer') return tx.transfer.update({ where: { id: op.id }, data });
    return tx.advance.update({ where: { id: op.id }, data });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}

function toOp(
  kind: OpKind,
  row: LiveRecord & { id: string; reference: string; status: TransactionStatus; employeeId: string; locationId: string | null },
): OpRow {
  return {
    kind,
    id: row.id,
    reference: row.reference,
    status: row.status,
    employeeId: row.employeeId,
    locationId: row.locationId,
    snapshot: snapshotOp(kind, row as unknown as Record<string, unknown>),
    record: row,
  };
}

function nextRequestId() {
  return `REQ-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}
