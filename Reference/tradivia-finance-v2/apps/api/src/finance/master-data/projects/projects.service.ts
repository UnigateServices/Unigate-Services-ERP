import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordStatus, Role } from '@prisma/client';
import { AuthUser } from '../../../auth/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(actor: AuthUser) {
    return this.prisma.project.findMany({
      where: {
        companyId: this.companyId,
        ...(actor.role === Role.EMPLOYEE ? { status: RecordStatus.ACTIVE } : {}),
      },
      select: projectSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProjectDto) {
    const name = normalizeName(dto.name);
    uniqueOrConflict(
      await this.prisma.project.findUnique({
        where: { companyId_name: { companyId: this.companyId, name } },
      }),
      'PROJECT_EXISTS',
    );

    return this.prisma.project.create({
      data: {
        companyId: this.companyId,
        name,
        status: (dto.status as RecordStatus) ?? RecordStatus.ACTIVE,
        showIn: dto.showIn?.length ? dto.showIn : DEFAULT_SHOW_IN,
      },
      select: projectSelect,
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    const current = foundOrThrow(
      await this.prisma.project.findFirst({
        where: { id, companyId: this.companyId },
      }),
      'PROJECT_NOT_FOUND',
    );

    const name = dto.name !== undefined ? normalizeName(dto.name) : current.name;
    if (name !== current.name) {
      uniqueOrConflict(
        await this.prisma.project.findUnique({
          where: { companyId_name: { companyId: this.companyId, name } },
        }),
        'PROJECT_EXISTS',
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        name,
        ...(dto.status ? { status: dto.status as RecordStatus } : {}),
        ...(dto.showIn ? { showIn: dto.showIn } : {}),
      },
      select: projectSelect,
    });
  }

  async remove(id: string) {
    const current = foundOrThrow(
      await this.prisma.project.findFirst({
        where: { id, companyId: this.companyId },
        include: { _count: { select: { incomes: true, outcomes: true, advances: true } } },
      }),
      'PROJECT_NOT_FOUND',
    );

    if (usageCount(current._count) > 0) {
      const row = await this.prisma.project.update({
        where: { id },
        data: { status: RecordStatus.INACTIVE },
        select: projectSelect,
      });
      return deactivatedPayload(row);
    }

    await this.prisma.project.delete({ where: { id } });
    return deletedPayload({
      id: current.id,
      name: current.name,
      status: current.status,
      showIn: current.showIn,
    });
  }

  private get companyId() {
    return this.config.get<string>('DEFAULT_COMPANY_ID', 'tradivia');
  }
}
