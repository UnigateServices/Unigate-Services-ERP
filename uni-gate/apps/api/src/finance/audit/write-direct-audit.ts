import { BadRequestException } from '@nestjs/common';
import { AuditActionType, AuditRequestStatus, Prisma } from '@prisma/client';
import { actorId, type FinanceActor } from '../finance-access';

export function requireDirectReason(reason?: string) {
  const text = (reason || '').trim();
  if (!text) {
    throw new BadRequestException('REASON_REQUIRED');
  }
  return text;
}

export function nextDirectId() {
  return `DIR-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

export function writeDirectAudit(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actor: FinanceActor;
    reference: string;
    locationId: string | null;
    actionType: 'UPDATE' | 'DELETE';
    oldDetails: Prisma.InputJsonValue;
    newDetails: Prisma.InputJsonValue;
    reason: string;
  },
) {
  return tx.auditTrail.create({
    data: {
      id: nextDirectId(),
      companyId: input.companyId,
      originalReference: input.reference,
      requesterId: actorId(input.actor),
      actionType: input.actionType === 'UPDATE' ? AuditActionType.UPDATE : AuditActionType.DELETE,
      oldDetails: input.oldDetails,
      newDetails: input.newDetails,
      requestStatus: AuditRequestStatus.DIRECT,
      supervisorId: actorId(input.actor),
      supervisorDecision: 'مباشر',
      reason: input.reason,
      locationId: input.locationId,
    },
  });
}
