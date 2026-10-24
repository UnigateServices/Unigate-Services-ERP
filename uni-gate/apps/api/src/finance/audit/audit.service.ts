import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Advance,
  AuditActionType,
  AuditRequestStatus,
  Exchange,
  Income,
  Outcome,
  Prisma,
  SalesPaymentStatus,
  TransactionStatus,
  Transfer,
  UserStatus,
  VisibilityScope,
} from '@prisma/client';
import { levelRank, type PermissionLevel } from '@unigate/shared';
import { toPermissionMap } from '../../auth/access';
import { actorId, locationWhere, type FinanceActor } from '../finance-access';
import { personRef, withNames } from '../people';
import { PrismaService } from '../../prisma/prisma.service';
import { releaseCustody, syncCustody } from '../advances/custody-book';
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
  requester: personRef,
  supervisor: personRef,
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
  constructor(private readonly prisma: PrismaService) {}

  /** Recorders (WRITE) see their own requests. Approvers and readers see the requests in their scope. */
  async list(actor: FinanceActor, status?: AuditRequestStatus) {
    const rows = await this.prisma.auditTrail.findMany({
      where: {
        companyId: actor.companyId,
        ...(status ? { requestStatus: status } : {}),
        ...(actor.level === 'WRITE' ? { requesterId: actor.membershipId ?? '__none__' } : locationWhere(actor)),
      },
      include: auditInclude,
      orderBy: [{ requestedAt: 'desc' }],
      take: 200,
    });
    return rows.map(withNames);
  }

  async history(actor: FinanceActor) {
    const rows = await this.prisma.auditTrail.findMany({
      where: {
        companyId: actor.companyId,
        requestStatus: { in: [AuditRequestStatus.APPROVED, AuditRequestStatus.REJECTED, AuditRequestStatus.DIRECT] },
        ...locationWhere(actor),
      },
      include: auditInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 400,
    });
    return rows.map(withNames);
  }

  async createRequest(actor: FinanceActor, dto: CreateAuditRequestDto) {
    const companyId = actor.companyId;
    const memberId = actorId(actor);
    // Decision B: the role's approval flags decide who asks. A role without the flag changes directly.
    const needsApproval = dto.actionType === 'UPDATE' ? actor.editRequiresApproval : actor.deleteRequiresApproval;
    if (!needsApproval) {
      throw new ForbiddenException('USE_DIRECT_ACTION');
    }

    const op = await this.findLiveOp(companyId, dto.reference);
    if (!op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }
    if (op.employeeId !== memberId) {
      throw new ForbiddenException('FORBIDDEN');
    }
    if (op.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('NOT_EDITABLE');
    }
    if (op.kind === 'income') await this.assertIncomeFree(companyId, op.id);
    if (op.kind === 'outcome') await this.assertOutcomeFree(companyId, op.id);

    const pending = await this.prisma.auditTrail.findFirst({
      where: {
        companyId,
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
      await validateOperationPatch(this.prisma, op.kind, op.record, companyId, dto.patch);
      newDetails = compactPatch(dto.patch);
    }

    const actionLabel = actionType === AuditActionType.DELETE ? 'حذف' : 'تعديل';

    return this.prisma.$transaction(async (tx) => {
      await this.setOpStatus(tx, companyId, op, TransactionStatus.PENDING_APPROVAL);

      const audit = await tx.auditTrail.create({
        data: {
          id: nextRequestId(),
          companyId,
          originalReference: op.reference,
          requesterId: memberId,
          actionType,
          oldDetails: op.snapshot,
          newDetails,
          requestStatus: AuditRequestStatus.PENDING,
          reason: (dto.reason || '').trim(),
          locationId: op.locationId,
        },
        include: auditInclude,
      });

      const approvers = await approversFor(tx, companyId, memberId, actor.level, op.locationId);

      const opNo = (op.record as { operationNumber?: number }).operationNumber;
      const opLabel = opNo ? `رقم ${opNo}` : '';
      const recipients = new Set<string>([memberId, ...approvers]);
      await tx.notification.createMany({
        data: [...recipients].map((employeeId) => ({
          companyId,
          employeeId,
          message:
            employeeId === memberId
              ? `تم إرسال طلب ${actionLabel} للعملية ${opLabel}`
              : `طلب ${actionLabel} للعملية ${opLabel} من ${audit.requester.user.name}`,
          section: 'pending',
          requestId: audit.id,
          actionType,
          reference: op.reference,
          requesterId: memberId,
          locationId: op.locationId,
        })),
      });

      return withNames(audit);
    });
  }

  async decide(actor: FinanceActor, id: string, decision: 'APPROVE' | 'REJECT') {
    const companyId = actor.companyId;
    const memberId = actorId(actor);

    const audit = await this.prisma.auditTrail.findFirst({
      where: {
        id,
        companyId,
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
    // Decision B: nobody decides their own request, and only above the requester's level
    // (the original supervisor decided only for employees; the general manager for everyone).
    if (audit.requesterId === memberId) {
      throw new ForbiddenException('FORBIDDEN');
    }
    if (actor.level !== 'ADMIN') {
      const requesterLevel = await financeLevelOf(this.prisma, companyId, audit.requesterId);
      if (levelRank(requesterLevel) >= levelRank(actor.level)) {
        throw new ForbiddenException('FORBIDDEN');
      }
    }

    const op = await this.findLiveOp(companyId, audit.originalReference);
    if (decision === 'APPROVE' && !op) {
      throw new NotFoundException('OP_NOT_FOUND');
    }

    const approved = decision === 'APPROVE';

    return this.prisma.$transaction(async (tx) => {
      if (op) {
        if (approved && audit.actionType === AuditActionType.DELETE) {
          if (op.kind === 'income') await this.assertIncomeFree(companyId, op.id);
          if (op.kind === 'outcome') await this.assertOutcomeFree(companyId, op.id);
          await this.setOpStatus(tx, companyId, op, TransactionStatus.DELETED, new Date());
          if (op.kind === 'advance') await releaseCustody(tx, companyId, op.id);
          await reverseLiveOperation(tx, companyId, memberId, op.kind, op.id, op.locationId);
        } else if (approved && audit.actionType === AuditActionType.UPDATE) {
          if (op.kind === 'income') await this.assertIncomeFree(companyId, op.id);
          if (op.kind === 'outcome') await this.assertOutcomeFree(companyId, op.id);
          await applyOperationPatch(
            tx,
            op.kind,
            op.id,
            op.record,
            companyId,
            asPatch(audit.newDetails),
          );
          await this.setOpStatus(tx, companyId, op, TransactionStatus.COMPLETED);
          if (op.kind === 'advance') {
            await syncCustody(tx, companyId, await tx.advance.findFirstOrThrow({ where: { id: op.id, companyId } }));
          }
          await syncLiveOperation(tx, companyId, memberId, op.kind, op.id);
        } else {
          await this.setOpStatus(tx, companyId, op, TransactionStatus.COMPLETED);
        }
      }

      const updated = await tx.auditTrail.update({
        where: { companyId_id: { companyId, id: audit.id } },
        data: {
          requestStatus: approved ? AuditRequestStatus.APPROVED : AuditRequestStatus.REJECTED,
          supervisorId: memberId,
          supervisorDecision: approved ? 'موافقة' : 'رفض',
        },
        include: auditInclude,
      });

      await tx.notification.deleteMany({
        where: { companyId, requestId: audit.id, section: 'pending' },
      });

      const recipients = new Set<string>([audit.requesterId, memberId]);
      const actionLabel = audit.actionType === AuditActionType.DELETE ? 'حذف' : 'تعديل';
      const storedNumber = (audit.oldDetails as { operationNumber?: number } | null)?.operationNumber;
      const opLabel = storedNumber ? `رقم ${storedNumber}` : '';
      await tx.notification.createMany({
        data: [...recipients].map((employeeId) => ({
          companyId,
          employeeId,
          message: approved
            ? employeeId === memberId
              ? `وافقتَ على طلب ${actionLabel} للعملية ${opLabel}`
              : `تمت الموافقة على طلب ${actionLabel} للعملية ${opLabel}`
            : employeeId === memberId
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

      return withNames(updated);
    });
  }

  private async assertOutcomeFree(companyId: string, outcomeId: string) {
    const linked = await this.prisma.purchaseInvoicePayment.findFirst({
      where: { companyId, outcomeId, status: SalesPaymentStatus.POSTED },
      select: { id: true },
    });
    if (linked) throw new BadRequestException('OUTCOME_LINKED_TO_INVOICE');
  }

  private async assertIncomeFree(companyId: string, incomeId: string) {
    const linked = await this.prisma.salesInvoicePayment.findFirst({
      where: { companyId, incomeId, status: SalesPaymentStatus.POSTED },
      select: { id: true },
    });
    if (linked) throw new BadRequestException('INCOME_LINKED_TO_INVOICE');
  }

  private async findLiveOp(companyId: string, reference: string): Promise<OpRow | null> {
    const ref = reference.trim();
    const where = {
      companyId,
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
      },
    });
    if (transfer) return toOp('transfer', transfer);
    const advance = await this.prisma.advance.findFirst({
      where,
      include: {
        borrower: { select: { name: true } },
        project: { select: { name: true } },
        bank: { select: { name: true } },
      },
    });
    if (advance) return toOp('advance', advance);
    return null;
  }

  private setOpStatus(
    tx: Prisma.TransactionClient,
    companyId: string,
    op: OpRow,
    status: TransactionStatus,
    deletedAt?: Date | null,
  ) {
    const data = { status, deletedAt: deletedAt ?? null };
    const where = { companyId_id: { companyId, id: op.id } };
    if (op.kind === 'income') return tx.income.update({ where, data });
    if (op.kind === 'outcome') return tx.outcome.update({ where, data });
    if (op.kind === 'exchange') return tx.exchange.update({ where, data });
    if (op.kind === 'transfer') return tx.transfer.update({ where, data });
    return tx.advance.update({ where, data });
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

/** The finance level a membership holds now, read from its current role. */
async function financeLevelOf(
  db: Pick<Prisma.TransactionClient, 'membership'>,
  companyId: string,
  membershipId: string,
): Promise<PermissionLevel> {
  const row = await db.membership.findFirst({
    where: { id: membershipId, companyId },
    select: { role: { select: { permissions: { where: { area: 'finance' }, select: { area: true, level: true } } } } },
  });
  return toPermissionMap(row?.role.permissions ?? []).finance;
}

/**
 * Who is told about a new request (decision B), as in the original: the next level up.
 * A recorder's request goes to the APPROVE members who see the operation's branch (the office
 * supervisors); an approver's request goes to the ADMIN members (the general manager).
 */
async function approversFor(
  tx: Prisma.TransactionClient,
  companyId: string,
  requesterId: string,
  requesterLevel: PermissionLevel,
  locationId: string | null,
) {
  const target: PermissionLevel = levelRank(requesterLevel) < levelRank('APPROVE') ? 'APPROVE' : 'ADMIN';
  const rows = await tx.membership.findMany({
    where: {
      companyId,
      id: { not: requesterId },
      user: { status: UserStatus.ACTIVE },
      role: { permissions: { some: { area: 'finance', level: target } } },
      ...(target === 'APPROVE' && locationId
        ? { OR: [{ locationId }, { role: { visibilityScope: VisibilityScope.ALL_BRANCHES } }] }
        : {}),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
