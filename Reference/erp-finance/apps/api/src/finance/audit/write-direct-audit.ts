import { BadRequestException } from '@nestjs/common';
import { AuditActionType, AuditRequestStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';

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
    actor: AuthUser;
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
      requesterId: input.actor.id,
      actionType: input.actionType === 'UPDATE' ? AuditActionType.UPDATE : AuditActionType.DELETE,
      oldDetails: input.oldDetails,
      newDetails: input.newDetails,
      requestStatus: AuditRequestStatus.DIRECT,
      supervisorId: input.actor.id,
      supervisorDecision: 'مباشر',
      reason: input.reason,
      locationId: input.locationId,
    },
  });
}
