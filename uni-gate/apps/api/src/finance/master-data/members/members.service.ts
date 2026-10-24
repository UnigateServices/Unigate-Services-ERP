import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { locationWhere, type FinanceActor } from '../../finance-access';

/**
 * The people finance records point at (decision A): the company's memberships, read only.
 * Replaces the original employee list for pickers such as the opening balance owner.
 * Users are created and edited in the foundation, never here.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: FinanceActor) {
    const rows = await this.prisma.membership.findMany({
      where: { companyId: actor.companyId, ...locationWhere(actor) },
      select: {
        id: true,
        locationId: true,
        location: { select: { id: true, name: true } },
        user: { select: { name: true, status: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.user.name,
      accountStatus: row.user.status === UserStatus.ACTIVE ? 'ACTIVE' : 'INACTIVE',
      locationId: row.locationId,
      location: row.location,
    }));
  }
}
