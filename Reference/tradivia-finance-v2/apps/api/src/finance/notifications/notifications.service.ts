import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRequestStatus } from '@prisma/client';
import { AuthUser } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const SECTIONS = ['pending', 'approved', 'rejected'] as const;
export type NotificationSection = (typeof SECTIONS)[number];

const notifInclude = {
  requester: { select: { id: true, name: true } },
} as const;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: AuthUser, section?: string) {
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
      requester: row.requester,
    }));
  }

  async counts(actor: AuthUser) {
    const [pending, approved, rejected] = await Promise.all([
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'pending') }),
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'approved') }),
      this.prisma.notification.count({ where: await this.sectionWhere(actor, 'rejected') }),
    ]);
    return { pending, approved, rejected };
  }

  async remove(actor: AuthUser, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, companyId: this.companyId, employeeId: actor.id },
    });
    if (!row) {
      throw new NotFoundException('NOTIF_NOT_FOUND');
    }
    if (row.section === 'pending') {
      throw new BadRequestException('NOTIF_PENDING_KEEP');
    }
    await this.prisma.notification.delete({ where: { id } });
    return { ok: true };
  }

  private async sectionWhere(actor: AuthUser, section: NotificationSection) {
    const where = {
      companyId: this.companyId,
      employeeId: actor.id,
      section,
    };

    if (section !== 'pending') {
      return where;
    }

    const pending = await this.prisma.auditTrail.findMany({
      where: { companyId: this.companyId, requestStatus: AuditRequestStatus.PENDING },
      select: { id: true },
    });
    const ids = pending.map((row) => row.id);

    return {
      ...where,
      requestId: { in: ids.length ? ids : [''] },
    };
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}
