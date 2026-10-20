import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { ErrorCode } from '@unigate/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type AccessLogItem = {
  id: string;
  createdAt: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  actorUserId: string;
  actorName: string;
  companyId: string;
  companyName: string;
  companyCode: string;
};

@Injectable()
export class AccessLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; companyId?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const companyId = query.companyId;
    if (companyId) await this.requireCompany(companyId);
    const where = companyId ? { companyId } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditEntry.count({ where }),
      this.prisma.auditEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          action: true,
          targetType: true,
          targetId: true,
          actorUserId: true,
          companyId: true,
          actor: { select: { name: true } },
          company: { select: { name: true, code: true } },
        },
      }),
    ]);
    return {
      items: rows.map(
        (row): AccessLogItem => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          actorUserId: row.actorUserId,
          actorName: row.actor.name,
          companyId: row.companyId,
          companyName: row.company.name,
          companyCode: row.company.code,
        }),
      ),
      page,
      pageSize,
      total,
    };
  }

  private async requireCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Company was not found.',
      });
    }
  }
}
