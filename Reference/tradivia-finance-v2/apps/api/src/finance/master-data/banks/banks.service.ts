import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus, Role } from '@prisma/client';
import { AuthUser } from '../../../auth/current-user.decorator';
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
export class BanksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.bank.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === Role.EMPLOYEE ? { status: RecordStatus.ACTIVE } : {}),
      },
      select: namedSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateNamedRecordDto) {
    const name = normalizeName(dto.name);
    uniqueOrConflict(
      await this.prisma.bank.findUnique({
        where: { companyId_name: { companyId: this.companyId, name } },
      }),
      'BANK_EXISTS',
    );

    return this.prisma.bank.create({
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
      await this.prisma.bank.findFirst({
        where: { id, companyId: this.companyId },
      }),
      'BANK_NOT_FOUND',
    );

    const name = dto.name !== undefined ? normalizeName(dto.name) : current.name;
    if (name !== current.name) {
      uniqueOrConflict(
        await this.prisma.bank.findUnique({
          where: { companyId_name: { companyId: this.companyId, name } },
        }),
        'BANK_EXISTS',
      );
    }

    return this.prisma.bank.update({
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
      await this.prisma.bank.findFirst({
        where: { id, companyId: this.companyId },
        include: {
          _count: {
            select: {
              incomes: true,
              outcomes: true,
              exchanges: true,
              transfersFrom: true,
              transfersTo: true,
              openingBalances: true,
            },
          },
        },
      }),
      'BANK_NOT_FOUND',
    );

    if (usageCount(current._count) > 0) {
      const row = await this.prisma.bank.update({
        where: { id },
        data: { status: RecordStatus.INACTIVE },
        select: namedSelect,
      });
      return deactivatedPayload(row);
    }

    await this.prisma.bank.delete({ where: { id } });
    return deletedPayload({ id: current.id, name: current.name, status: current.status });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}
