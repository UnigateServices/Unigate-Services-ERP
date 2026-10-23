import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PermissionLevel as DbPermissionLevel, Prisma, VisibilityScope } from '@prisma/client';
import { ErrorCode, atLeast, type PermissionArea, type PermissionLevel, type PermissionMap } from '@unigate/shared';
import { accessFor, requireCompanyAdmin, toPermissionMap, withinLevels } from '../auth/access';
import type { RequestAuth } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

type RoleRow = {
  id: string;
  key: string;
  name: string;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  companyId: string;
  permissions: { area: string; level: DbPermissionLevel }[];
};

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  /** Derived: users area at WRITE or higher. */
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  /** Every area, NONE included. */
  permissions: PermissionMap;
};

export type PlatformRoleDto = RoleDto & { companyId: string };

export type PermissionInput = { area: PermissionArea; level: PermissionLevel };

type RoleInput = {
  key: string;
  name: string;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  /** Areas supplied here are replaced. Areas left out keep their level. */
  permissions?: PermissionInput[];
};

/**
 * Runs inside the write transaction, after the change and before commit. Throwing rolls it back.
 * `before` is null for a new role.
 */
type RoleGuard = (before: PermissionMap | null, after: PermissionMap, roleId: string) => void;

const roleSelect = {
  id: true,
  key: true,
  name: true,
  visibilityScope: true,
  editRequiresApproval: true,
  deleteRequiresApproval: true,
  companyId: true,
  permissions: { select: { area: true, level: true } },
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

  /** Phase 11: a member with roles WRITE and all-branch scope creates roles in the session company. */
  async createForSession(auth: RequestAuth, input: RoleInput): Promise<RoleDto> {
    const access = requireCompanyAdmin(auth, 'roles');
    return stripCompany(await this.create(access.companyId, input, auth.userId, memberGuard(auth)));
  }

  async updateForSession(auth: RequestAuth, roleId: string, input: RoleInput): Promise<RoleDto> {
    const access = requireCompanyAdmin(auth, 'roles');
    return stripCompany(await this.update(access.companyId, roleId, input, auth.userId, memberGuard(auth)));
  }

  async create(companyId: string, input: RoleInput, actorUserId: string, guard?: RoleGuard): Promise<PlatformRoleDto> {
    const { permissions, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireCompany(companyId, tx);
        await this.assertKeyAvailable(tx, companyId, fields.key);
        const created = await tx.role.create({ data: { companyId, ...fields }, select: { id: true } });
        if (permissions?.length) await applyPermissions(tx, companyId, created.id, permissions);
        const role = await this.loadRole(tx, companyId, created.id);
        guard?.(null, toPermissionMap(role.permissions), role.id);
        await this.audit(tx, actorUserId, companyId, created.id, AuditAction.CREATE);
        return toPlatformRole(role);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  async update(
    companyId: string,
    roleId: string,
    input: RoleInput,
    actorUserId: string,
    guard?: RoleGuard,
  ): Promise<PlatformRoleDto> {
    const { permissions, ...fields } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Waits for in-flight user assignments to this role, so the scope check below sees them.
        await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} AND company_id = ${companyId} FOR UPDATE`;
        const existing = await tx.role.findFirst({
          where: { id: roleId, companyId },
          select: { id: true, visibilityScope: true },
        });
        if (!existing) throw this.roleNotFound();
        const before = toPermissionMap(await tx.rolePermission.findMany({ where: { companyId, roleId } }));
        if (existing.visibilityScope !== fields.visibilityScope) {
          await this.assertScopeCompatible(tx, roleId, fields.visibilityScope);
        }
        await this.assertKeyAvailable(tx, companyId, fields.key, roleId);
        await tx.role.update({
          where: { companyId_id: { companyId, id: roleId } },
          data: fields,
        });
        if (permissions?.length) await applyPermissions(tx, companyId, roleId, permissions);
        const role = await this.loadRole(tx, companyId, roleId);
        guard?.(before, toPermissionMap(role.permissions), roleId);
        await this.audit(tx, actorUserId, companyId, roleId, AuditAction.UPDATE);
        return toPlatformRole(role);
      });
    } catch (error) {
      this.rethrowKnown(error);
    }
  }

  /** Read by members with roles READ, or users WRITE (the user form needs the role list). */
  async listForSession(auth: RequestAuth) {
    const roles = accessFor(auth, 'roles');
    const users = accessFor(auth, 'users');
    if (!atLeast(roles.level, 'READ') && !atLeast(users.level, 'WRITE')) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission for this action.',
      });
    }
    const rows = await this.prisma.role.findMany({
      where: { companyId: roles.companyId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: roleSelect,
    });
    return { items: rows.map(toCustomerRole) };
  }

  private async loadRole(tx: Prisma.TransactionClient, companyId: string, roleId: string) {
    return tx.role.findFirstOrThrow({ where: { id: roleId, companyId }, select: roleSelect });
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
    throw this.scopeConflict();
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

  private scopeConflict() {
    return new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'Assigned users must be made compatible before this role scope can change.',
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
    if (isScopeMismatch(error)) throw this.scopeConflict();
    throw error;
  }
}

/**
 * Decision L for members. A platform operator is not limited here.
 * - Nobody changes the role they hold, so a company can never lock its own administrators out.
 * - Nobody touches a role that is above them in any area, or raises one above themselves.
 */
function memberGuard(auth: RequestAuth): RoleGuard | undefined {
  const membership = auth.actor === 'member' ? auth.membership : null;
  if (!membership) return undefined;
  return (before, after, roleId) => {
    if (roleId === membership.roleId) {
      throw new ConflictException({ code: ErrorCode.CONFLICT, message: 'You cannot change your own role.' });
    }
    if ((before && !withinLevels(membership.permissions, before)) || !withinLevels(membership.permissions, after)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'A role cannot have more permissions than yours.',
      });
    }
  };
}

function stripCompany(role: PlatformRoleDto): RoleDto {
  const { companyId: _companyId, ...rest } = role;
  return rest;
}

/**
 * Sets each supplied area. NONE deletes the row, because a missing row is NONE.
 * Callers validate areas, levels, and duplicates first (RoleBodyDto).
 */
export async function applyPermissions(
  tx: Prisma.TransactionClient,
  companyId: string,
  roleId: string,
  permissions: PermissionInput[],
) {
  for (const { area, level } of permissions) {
    if (level === 'NONE') {
      await tx.rolePermission.deleteMany({ where: { companyId, roleId, area } });
      continue;
    }
    await tx.rolePermission.upsert({
      where: { companyId_roleId_area: { companyId, roleId, area } },
      create: { companyId, roleId, area, level },
      update: { level },
    });
  }
}

/** The database trigger that keeps role scope and membership location in agreement. */
export function isScopeMismatch(error: unknown) {
  return error instanceof Error && error.message.includes('ROLE_SCOPE_MISMATCH');
}

function toCustomerRole(row: RoleRow): RoleDto {
  const permissions = toPermissionMap(row.permissions);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    canManageUsers: atLeast(permissions.users, 'WRITE'),
    visibilityScope: row.visibilityScope,
    editRequiresApproval: row.editRequiresApproval,
    deleteRequiresApproval: row.deleteRequiresApproval,
    permissions,
  };
}

function toPlatformRole(row: RoleRow): PlatformRoleDto {
  return { ...toCustomerRole(row), companyId: row.companyId };
}
