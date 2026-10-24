import { Injectable } from '@nestjs/common';
import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { activeMasterDataOnly, type FinanceActor } from '../../finance-access';
import {
  deactivatedPayload,
  deletedPayload,
  foundOrThrow,
  namedSelect,
  normalizeName,
  uniqueOrConflict,
  usageCount,
} from '../named-record';
import { CreateProjectDto, PROJECT_SHOW_IN, UpdateProjectDto } from './dto/project.dto';

const projectSelect = {
  ...namedSelect,
  showIn: true,
} as const;

const DEFAULT_SHOW_IN = [...PROJECT_SHOW_IN];

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(actor: FinanceActor) {
    const companyId = actor.companyId;
    return this.prisma.project.findMany({
      where: {
        companyId,
        ...(activeMasterDataOnly(actor) ? { status: RecordStatus.ACTIVE } : {}),
      },
      select: projectSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: FinanceActor, dto: CreateProjectDto) {
    const companyId = actor.companyId;
    const name = normalizeName(dto.name);
    uniqueOrConflict(
      await this.prisma.project.findUnique({
        where: { companyId_name: { companyId, name } },
      }),
      'PROJECT_EXISTS',
    );

    return this.prisma.project.create({
      data: {
        companyId,
        name,
        status: (dto.status as RecordStatus) ?? RecordStatus.ACTIVE,
        showIn: dto.showIn?.length ? dto.showIn : DEFAULT_SHOW_IN,
      },
      select: projectSelect,
    });
  }

  async update(actor: FinanceActor, id: string, dto: UpdateProjectDto) {
    const companyId = actor.companyId;
    const current = foundOrThrow(
      await this.prisma.project.findFirst({
        where: { id, companyId },
      }),
      'PROJECT_NOT_FOUND',
    );

    const name = dto.name !== undefined ? normalizeName(dto.name) : current.name;
    if (name !== current.name) {
      uniqueOrConflict(
        await this.prisma.project.findUnique({
          where: { companyId_name: { companyId, name } },
        }),
        'PROJECT_EXISTS',
      );
    }

    return this.prisma.project.update({
      where: { companyId_id: { companyId, id } },
      data: {
        name,
        ...(dto.status ? { status: dto.status as RecordStatus } : {}),
        ...(dto.showIn ? { showIn: dto.showIn } : {}),
      },
      select: projectSelect,
    });
  }

  async remove(actor: FinanceActor, id: string) {
    const companyId = actor.companyId;
    const current = foundOrThrow(
      await this.prisma.project.findFirst({
        where: { id, companyId },
        include: {
          costCenter: { select: { id: true } },
          _count: { select: { incomes: true, outcomes: true, advances: true, journalLines: true } },
        },
      }),
      'PROJECT_NOT_FOUND',
    );

    // A cost center is made for every project the ledger touches, and its key is RESTRICT here
    // (the original silently cleared it). A used project, or one with a center, is deactivated.
    if (usageCount(current._count) > 0 || current.costCenter) {
      const row = await this.prisma.project.update({
        where: { companyId_id: { companyId, id } },
        data: { status: RecordStatus.INACTIVE },
        select: projectSelect,
      });
      return deactivatedPayload(row);
    }

    await this.prisma.project.delete({ where: { companyId_id: { companyId, id } } });
    return deletedPayload({
      id: current.id,
      name: current.name,
      status: current.status,
      showIn: current.showIn,
    });
  }
}
