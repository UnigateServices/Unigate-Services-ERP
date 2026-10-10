import { ConflictException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditAction, Prisma, RecordStatus, VisibilityScope } from '@prisma/client';
import { ErrorCode } from '@unigate/shared';
import type { RequestAuth } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

type LocationRow = {
  id: string;
  name: string;
  status: RecordStatus;
  companyId?: string;
};

export type LocationDto = {
  id: string;
  name: string;
  status: RecordStatus;
};

export type PlatformLocationDto = LocationDto & {
  companyId: string;
};

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCompany(companyId: string) {
    await this.requireCompany(companyId);
    const rows = await this.prisma.location.findMany({
      where: { companyId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, status: true, companyId: true },
    });
    return { items: rows.map(toPlatformLocation) };
  }

  async create(companyId: string, name: string, actorUserId: string): Promise<PlatformLocationDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCompany(companyId, tx);
        await this.assertNameAvailable(tx, companyId, name);
        const location = await tx.location.create({
          data: { companyId, name, status: RecordStatus.ACTIVE },
          select: { id: true, name: true, status: true, companyId: true },
        });
        await this.audit(tx, actorUserId, companyId, location.id, AuditAction.CREATE);
        return toPlatformLocation(location);
      });
    } catch (error) {
      this.rethrowNameTaken(error);
    }
  }

  async update(
    companyId: string,
    locationId: string,
    input: { name: string; status: 'ACTIVE' | 'INACTIVE' },
    actorUserId: string,
  ): Promise<PlatformLocationDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.location.findFirst({
          where: { id: locationId, companyId },
          select: { id: true },
        });
        if (!existing) throw this.locationNotFound();
        await this.assertNameAvailable(tx, companyId, input.name, locationId);
        const location = await tx.location.update({
          where: { companyId_id: { companyId, id: locationId } },
          data: { name: input.name, status: input.status },
          select: { id: true, name: true, status: true, companyId: true },
        });
        await this.audit(tx, actorUserId, companyId, location.id, AuditAction.UPDATE);
        return toPlatformLocation(location);
      });
    } catch (error) {
      this.rethrowNameTaken(error);
    }
  }

  async listForSession(auth: RequestAuth) {
    const companyId = this.companyFromSession(auth);
    const locationId = this.visibleLocationId(auth);
    if (locationId === null) return { items: [] as LocationDto[] };
    const rows = await this.prisma.location.findMany({
      where: locationId ? { companyId, id: locationId } : { companyId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, status: true },
    });
    return { items: rows.map(toCustomerLocation) };
  }

  private companyFromSession(auth: RequestAuth) {
    if (auth.actor === 'platform') {
      if (!auth.actingCompanyId) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'A support company is required.',
        });
      }
      return auth.actingCompanyId;
    }
    if (!auth.membership) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    return auth.membership.companyId;
  }

  /**
   * undefined: every branch of the session company.
   * string: that membership location only.
   * null: BRANCH or OWN with no assigned location, so the list is empty.
   */
  private visibleLocationId(auth: RequestAuth): string | null | undefined {
    if (auth.actor === 'platform') return undefined;
    const membership = auth.membership;
    if (!membership || membership.visibility === VisibilityScope.ALL_BRANCHES) return undefined;
    return membership.locationId;
  }

  private async requireCompany(companyId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw this.companyNotFound();
  }

  private async assertNameAvailable(tx: Prisma.TransactionClient, companyId: string, name: string, exceptId?: string) {
    const taken = await tx.location.findFirst({
      where: {
        companyId,
        name,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ErrorCode.NAME_TAKEN,
        message: 'Another branch in this company already uses this name.',
      });
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    companyId: string,
    locationId: string,
    action: AuditAction,
  ) {
    return tx.auditEntry.create({
      data: {
        actorUserId,
        companyId,
        action,
        targetType: 'location',
        targetId: locationId,
      },
    });
  }

  private companyNotFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Company was not found.',
    });
  }

  private locationNotFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Location was not found.',
    });
  }

  private rethrowNameTaken(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: ErrorCode.NAME_TAKEN,
        message: 'Another branch in this company already uses this name.',
      });
    }
    throw error;
  }
}

function toPlatformLocation(row: LocationRow & { companyId: string }): PlatformLocationDto {
  return { id: row.id, name: row.name, status: row.status, companyId: row.companyId };
}

function toCustomerLocation(row: LocationRow): LocationDto {
  return { id: row.id, name: row.name, status: row.status };
}
