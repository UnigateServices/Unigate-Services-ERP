import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditAction, Prisma, VisibilityScope } from '@prisma/client';
import { ErrorCode } from '@unigate/shared';
import type { RequestAuth } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

type RoleRow = {
  id: string;
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  companyId?: string;
};

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

export type PlatformRoleDto = RoleDto & { companyId: string };

type RoleInput = {
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

const roleSelect = {
  id: true,
  key: true,
  name: true,
  canManageUsers: true,
  visibilityScope: true,
  editRequiresApproval: true,
  deleteRequiresApproval: true,
  companyId: true,
} as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCompany(companyId: string) {
    await this.requireCompany(companyId);
    const rows = await this.prisma.role.findMany({
      where: { companyId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: roleSelect,
    });
    return { items: rows.map(toPlatformRole) };
  }

  async create(companyId: string, input: RoleInput, actorUserId: string): Promise<PlatformRoleDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCompany(companyId, tx);
        await this.assertKeyAvailable(tx, companyId, input.key);
        const role = await tx.role.create({
          data: { companyId, ...input },
          select: roleSelect,
        });
        await this.audit(tx, actorUserId, companyId, role.id, AuditAction.CREATE);
        return toPlatformRole(role);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  async update(companyId: string, roleId: string, input: RoleInput, actorUserId: string): Promise<PlatformRoleDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Waits for in-flight user assignments to this role, so the scope check below sees them.
        await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} AND company_id = ${companyId} FOR UPDATE`;
        const existing = await tx.role.findFirst({
          where: { id: roleId, companyId },
          select: { id: true, visibilityScope: true },
        });
        if (!existing) throw this.roleNotFound();
        if (existing.visibilityScope !== input.visibilityScope) {
          await this.assertScopeCompatible(tx, roleId, input.visibilityScope);
        }
        await this.assertKeyAvailable(tx, companyId, input.key, roleId);
        const role = await tx.role.update({
          where: { companyId_id: { companyId, id: roleId } },
          data: input,
          select: roleSelect,
        });
        await this.audit(tx, actorUserId, companyId, role.id, AuditAction.UPDATE);
        return toPlatformRole(role);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  async listForSession(auth: RequestAuth) {
    const companyId = this.companyFromSession(auth);
    const rows = await this.prisma.role.findMany({
      where: { companyId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        canManageUsers: true,
        visibilityScope: true,
        editRequiresApproval: true,
        deleteRequiresApproval: true,
      },
    });
    return { items: rows.map(toCustomerRole) };
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
    if (!auth.membership.canManageUsers) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'User management permission is required.',
      });
    }
    return auth.membership.companyId;
  }

  private async assertScopeCompatible(tx: Prisma.TransactionClient, roleId: string, nextScope: VisibilityScope) {
    const memberships = await tx.membership.findMany({
      where: { roleId },
      select: { id: true, locationId: true },
    });
    const invalid =
      nextScope === VisibilityScope.ALL_BRANCHES
        ? memberships.some((membership) => membership.locationId !== null)
        : memberships.some((membership) => membership.locationId === null);
    if (!invalid) return;
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'Assigned users must be made compatible before this role scope can change.',
    });
  }

  private async requireCompany(companyId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw this.companyNotFound();
  }

  private async assertKeyAvailable(tx: Prisma.TransactionClient, companyId: string, key: string, exceptId?: string) {
    const taken = await tx.role.findFirst({
      where: {
        companyId,
        key,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ErrorCode.KEY_TAKEN,
        message: 'Another role in this company already uses this key.',
      });
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    companyId: string,
    roleId: string,
    action: AuditAction,
  ) {
    return tx.auditEntry.create({
      data: {
        actorUserId,
        companyId,
        action,
        targetType: 'role',
        targetId: roleId,
      },
    });
  }

  private companyNotFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Company was not found.',
    });
  }

  private roleNotFound() {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Role was not found.',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: ErrorCode.KEY_TAKEN,
        message: 'Another role in this company already uses this key.',
      });
    }
    throw error;
  }
}

function toPlatformRole(row: RoleRow & { companyId: string }): PlatformRoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    canManageUsers: row.canManageUsers,
    visibilityScope: row.visibilityScope,
    editRequiresApproval: row.editRequiresApproval,
    deleteRequiresApproval: row.deleteRequiresApproval,
    companyId: row.companyId,
  };
}

function toCustomerRole(row: RoleRow): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    canManageUsers: row.canManageUsers,
    visibilityScope: row.visibilityScope,
    editRequiresApproval: row.editRequiresApproval,
    deleteRequiresApproval: row.deleteRequiresApproval,
  };
}
