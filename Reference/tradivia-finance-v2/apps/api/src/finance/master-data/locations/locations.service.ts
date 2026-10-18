import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus } from '@prisma/client';
import { AuthUser } from '../../../auth/current-user.decorator';
import { isGeneralManager } from '../../../auth/access';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../dto/named-record.dto';
import {
  deactivatedPayload,
  deletedPayload,
  foundOrThrow,
  namedSelect,
  normalizeName,
  uniqueOrConflict,
  usageCount,
} from '../named-record';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.location.findMany({
      where: {
        companyId: this.companyId,
        ...(isGeneralManager(actor) ? {} : { id: actor.locationId ?? '__none__' }),
      },
      select: namedSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateNamedRecordDto) {
    const name = normalizeName(dto.name);
    uniqueOrConflict(
      await this.prisma.location.findUnique({
        where: { companyId_name: { companyId: this.companyId, name } },
      }),
      'LOCATION_EXISTS',
    );

    return this.prisma.location.create({
      data: {
        companyId: this.companyId,
        name,
        status: (dto.status as RecordStatus) ?? RecordStatus.ACTIVE,
      },
      select: namedSelect,
    });
  }

  async update(id: string, dto: UpdateNamedRecordDto) {
    const current = foundOrThrow(
      await this.prisma.location.findFirst({
        where: { id, companyId: this.companyId },
      }),
      'LOCATION_NOT_FOUND',
    );

    const name = dto.name !== undefined ? normalizeName(dto.name) : current.name;
    if (name !== current.name) {
      uniqueOrConflict(
        await this.prisma.location.findUnique({
          where: { companyId_name: { companyId: this.companyId, name } },
        }),
        'LOCATION_EXISTS',
      );
    }

    if (dto.status === RecordStatus.INACTIVE) {
      await this.assertNotLastActive(id);
    }

    return this.prisma.location.update({
      where: { id },
      data: {
        name,
        ...(dto.status ? { status: dto.status as RecordStatus } : {}),
      },
      select: namedSelect,
    });
  }

  async remove(id: string) {
    const current = foundOrThrow(
      await this.prisma.location.findFirst({
        where: { id, companyId: this.companyId },
        include: {
          _count: {
            select: {
              employees: true,
              incomes: true,
              outcomes: true,
              exchanges: true,
              transfers: true,
              advances: true,
              openingBalances: true,
              auditTrail: true,
              notifications: true,
            },
          },
        },
      }),
      'LOCATION_NOT_FOUND',
    );

    if (usageCount(current._count) > 0) {
      await this.assertNotLastActive(id);
      const row = await this.prisma.location.update({
        where: { id },
        data: { status: RecordStatus.INACTIVE },
        select: namedSelect,
      });
      return deactivatedPayload(row);
    }

    await this.assertNotLastActive(id);
    await this.prisma.location.delete({ where: { id } });
    return deletedPayload({ id: current.id, name: current.name, status: current.status });
  }

  private async assertNotLastActive(exceptId: string) {
    const remaining = await this.prisma.location.count({
      where: {
        companyId: this.companyId,
        status: RecordStatus.ACTIVE,
        NOT: { id: exceptId },
      },
    });
    if (remaining < 1) {
      throw new BadRequestException('LAST_LOCATION');
    }
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}
