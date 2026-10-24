import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { FinanceActor } from '../finance-access';
import { personRef, withNames } from '../people';

const SECTIONS = ['pending', 'approved', 'rejected'] as const;
export type NotificationSection = (typeof SECTIONS)[number];

const notifInclude = {
  requester: personRef,
} as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: FinanceActor, section?: string) {
    const tab: NotificationSection = SECTIONS.includes(section as NotificationSection)
      ? (section as NotificationSection)
      : 'pending';

    const rows = await this.prisma.notification.findMany({
      where: await this.sectionWhere(actor, tab),
      include: notifInclude,
      orderBy: [{ occurredAt: 'desc' }],
      take: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      occurredAt: row.occurredAt.toISOString(),
      status: row.status,
      section: row.section,
      requestId: row.requestId,
      actionType: row.actionType,
      reference: row.reference,
      requester: withNames(row).requester,
    }));
  }

  async counts(actor: FinanceActor) {
    const [pending, approved, rejected] = await Promise.all([
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'pending') }),
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'approved') }),
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'rejected') }),
    ]);
    return { pending, approved, rejected };
  }

  async remove(actor: FinanceActor, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, companyId: actor.companyId, employeeId: actor.membershipId ?? '__none__' },
    });
    if (!row) {
      throw new NotFoundException('NOTIF_NOT_FOUND');
    }
    if (row.section === 'pending') {
      throw new BadRequestException('NOTIF_PENDING_KEEP');
    }
    await this.prisma.notification.delete({ where: { companyId_id: { companyId: actor.companyId, id } } });
    return { ok: true };
  }

  private async sectionWhere(actor: FinanceActor, section: NotificationSection) {
    const where = {
      companyId: actor.companyId,
      employeeId: actor.membershipId ?? '__none__',
      section,
    };

    if (section !== 'pending') {
      return where;
    }

    const pending = await this.prisma.auditTrail.findMany({
      where: { companyId: actor.companyId, requestStatus: AuditRequestStatus.PENDING },
      select: { id: true },
    });
    const ids = pending.map((row) => row.id);

    return {
      ...where,
      requestId: { in: ids.length ? ids : [''] },
    };
  }
}
