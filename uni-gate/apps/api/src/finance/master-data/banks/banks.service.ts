import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { activeMasterDataOnly, type FinanceActor } from '../../finance-access';
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
  constructor(private readonly prisma: PrismaService) {}

  list(actor: FinanceActor) {
    const companyId = actor.companyId;
    return this.prisma.bank.findMany({
      where: {
        companyId,
        ...(activeMasterDataOnly(actor) ? { status: RecordStatus.ACTIVE } : {}),
      },
      select: namedSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: FinanceActor, dto: CreateNamedRecordDto) {
    const companyId = actor.companyId;
    const name = normalizeName(dto.name);
    uniqueOrConflict(
      await this.prisma.bank.findUnique({
        where: { companyId_name: { companyId, name } },
      }),
      'BANK_EXISTS',
    );

    return this.prisma.bank.create({
      data: {
        companyId,
        name,
        status: (dto.status as RecordStatus) ?? RecordStatus.ACTIVE,
      },
      select: namedSelect,
    });
  }

  async update(actor: FinanceActor, id: string, dto: UpdateNamedRecordDto) {
    const companyId = actor.companyId;
    const current = foundOrThrow(
      await this.prisma.bank.findFirst({
        where: { id, companyId },
      }),
      'BANK_NOT_FOUND',
    );

    const name = dto.name !== undefined ? normalizeName(dto.name) : current.name;
    if (name !== current.name) {
      uniqueOrConflict(
        await this.prisma.bank.findUnique({
          where: { companyId_name: { companyId, name } },
        }),
        'BANK_EXISTS',
      );
    }

    return this.prisma.bank.update({
      where: { companyId_id: { companyId, id } },
      data: {
        name,
        ...(dto.status ? { status: dto.status as RecordStatus } : {}),
      },
      select: namedSelect,
    });
  }

  async remove(actor: FinanceActor, id: string) {
    const companyId = actor.companyId;
    const current = foundOrThrow(
      await this.prisma.bank.findFirst({
        where: { id, companyId },
        include: {
          _count: {
            select: {
              incomes: true,
              outcomes: true,
              exchanges: true,
              transfersFrom: true,
              transfersTo: true,
              openingBalances: true,
              advances: true,
            },
          },
        },
      }),
      'BANK_NOT_FOUND',
    );

    if (usageCount(current._count) > 0) {
      const row = await this.prisma.bank.update({
        where: { companyId_id: { companyId, id } },
        data: { status: RecordStatus.INACTIVE },
        select: namedSelect,
      });
      return deactivatedPayload(row);
    }

    await this.prisma.bank.delete({ where: { companyId_id: { companyId, id } } });
    return deletedPayload({ id: current.id, name: current.name, status: current.status });
  }
}
