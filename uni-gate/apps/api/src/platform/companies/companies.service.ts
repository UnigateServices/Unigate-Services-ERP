import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, CompanyStatus, Prisma, RecordStatus } from '@prisma/client';
import { ErrorCode, MODULE_KEYS, isSubscriptionExpired, todayInDamascus, type ModuleKey } from '@unigate/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_PRESETS } from './role-presets';

type CompanyRecord = {
  id: string;
  name: string;
  code: string;
  status: CompanyStatus;
  priceUsd: Prisma.Decimal;
  expiresOn: Date;
};

export type PlatformCompanyDto = {
  id: string;
  name: string;
  code: string;
  status: CompanyStatus;
  priceUsd: string;
  expiresOn: string;
};

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; q?: string; status?: CompanyStatus }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = query.q?.trim();
    const where: Prisma.CompanyWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map(toCompanyDto),
      page,
      pageSize,
      total,
    };
  }

  async get(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { modules: true },
    });
    if (!company) throw this.notFound();
    const [branches, users] = await this.prisma.$transaction([
      this.prisma.location.count({ where: { companyId } }),
      this.prisma.membership.count({ where: { companyId } }),
    ]);
    const enabled = new Map(company.modules.map((module) => [module.moduleKey, module.enabled]));
    return {
      ...toCompanyDto(company),
      counts: { branches, users },
      modules: MODULE_KEYS.map((key) => ({ key, enabled: enabled.get(key) ?? false })),
    };
  }

  async create(
    input: {
      name: string;
      code: string;
      priceUsd: string;
      expiresOn: string;
      preset: 'tradivia' | 'simple';
      modules: ModuleKey[];
    },
    actorUserId: string,
  ) {
    try {
      const company = await this.prisma.$transaction((tx) => this.bootstrap(tx, input, actorUserId));
      return toCompanyDto(company);
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  async update(
    companyId: string,
    input: { name: string; code: string; priceUsd: string; expiresOn: string },
    actorUserId: string,
  ) {
    try {
      const company = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.company.findUnique({ where: { id: companyId } });
        if (!existing) throw this.notFound();
        await this.assertCodeAvailable(tx, input.code, companyId);
        const company = await tx.company.update({
          where: { id: companyId },
          data: {
            name: input.name,
            code: input.code,
            priceUsd: input.priceUsd,
            expiresOn: utcDate(input.expiresOn),
          },
        });
        await this.audit(tx, actorUserId, company.id, AuditAction.UPDATE);
        return company;
      });
      return toCompanyDto(company);
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  async suspend(companyId: string, actorUserId: string) {
    const company = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.company.findUnique({ where: { id: companyId } });
      if (!existing) throw this.notFound();
      if (existing.status === CompanyStatus.SUSPENDED) return existing;
      const company = await tx.company.update({
        where: { id: companyId },
        data: { status: CompanyStatus.SUSPENDED },
      });
      await this.audit(tx, actorUserId, company.id, AuditAction.UPDATE);
      return company;
    });
    return toCompanyDto(company);
  }

  async activate(companyId: string, expiresOn: string, actorUserId: string) {
    if (isSubscriptionExpired(expiresOn, todayInDamascus())) {
      throw new BadRequestException({
        code: ErrorCode.DATE_PAST,
        message: 'The date is already past.',
      });
    }
    const company = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.company.findUnique({ where: { id: companyId } });
      if (!existing) throw this.notFound();
      const company = await tx.company.update({
        where: { id: companyId },
        data: { status: CompanyStatus.ACTIVE, expiresOn: utcDate(expiresOn) },
      });
      await this.audit(tx, actorUserId, company.id, AuditAction.UPDATE);
      return company;
    });
    return toCompanyDto(company);
  }

  private async bootstrap(
    tx: Prisma.TransactionClient,
    input: {
      name: string;
      code: string;
      priceUsd: string;
      expiresOn: string;
      preset: 'tradivia' | 'simple';
      modules: ModuleKey[];
    },
    actorUserId: string,
  ) {
    await this.assertCodeAvailable(tx, input.code);
    const company = await tx.company.create({
      data: {
        name: input.name,
        code: input.code,
        status: CompanyStatus.ACTIVE,
        priceUsd: input.priceUsd,
        expiresOn: utcDate(input.expiresOn),
      },
    });
    await tx.location.create({
      data: {
        companyId: company.id,
        name: company.name,
        status: RecordStatus.ACTIVE,
      },
    });
    await tx.role.createMany({
      data: ROLE_PRESETS[input.preset].map((role) => ({
        companyId: company.id,
        ...role,
      })),
    });
    const enabled = new Set(input.modules);
    await tx.companyModule.createMany({
      data: MODULE_KEYS.map((moduleKey) => ({
        companyId: company.id,
        moduleKey,
        enabled: enabled.has(moduleKey),
      })),
    });
    await this.audit(tx, actorUserId, company.id, AuditAction.CREATE);
    return company;
  }

  private async assertCodeAvailable(tx: Prisma.TransactionClient, code: string, exceptId?: string) {
    const taken = await tx.company.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ErrorCode.CODE_TAKEN,
        message: 'Another company already uses this code.',
      });
    }
  }

  private audit(tx: Prisma.TransactionClient, actorUserId: string, companyId: string, action: AuditAction) {
    return tx.auditEntry.create({
      data: {
        actorUserId,
        companyId,
        action,
        targetType: 'company',
        targetId: companyId,
      },
    });
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Company was not found.',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: ErrorCode.CODE_TAKEN,
        message: 'Another company already uses this code.',
      });
    }
    throw error;
  }
}

function toCompanyDto(company: CompanyRecord): PlatformCompanyDto {
  return {
    id: company.id,
    name: company.name,
    code: company.code,
    status: company.status,
    priceUsd: company.priceUsd.toFixed(2),
    expiresOn: calendarDate(company.expiresOn),
  };
}

function utcDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function calendarDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
