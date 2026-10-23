import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PermissionLevel as DbPermissionLevel, Prisma, VisibilityScope } from '@prisma/client';
import { ErrorCode, atLeast, type PermissionArea, type PermissionLevel, type PermissionMap } from '@unigate/shared';
import { accessFor, requireCompanyAdmin, toPermissionMap } from '../auth/access';
import {
  assertKeepsRoleEditors,
  assertWithin,
  countRoleEditors,
  lockActorCeiling,
  lockCompanyAdmins,
  roleShape,
  type ActorCeiling,
  type RoleShape,
} from '../auth/member-guard';
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

/** Member checks (decision L) around a role write. Throwing rolls the transaction back. */
type RoleGuard = {
  /** First statement in the transaction, before the role row is locked. */
  begin(tx: Prisma.TransactionClient, companyId: string): Promise<void>;
  /** After the change, before commit. `before` is null for a new role. */
  check(tx: Prisma.TransactionClient, companyId: string, before: RoleShape | null, after: RoleShape, roleId: string): Promise<void>;
};

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
        await guard?.begin(tx, companyId);
        await this.requireCompany(companyId, tx);
        await this.assertKeyAvailable(tx, companyId, fields.key);
        const created = await tx.role.create({ data: { companyId, ...fields }, select: { id: true } });
        if (permissions?.length) await applyPermissions(tx, companyId, created.id, permissions);
        const role = await this.loadRole(tx, companyId, created.id);
        await guard?.check(tx, companyId, null, roleShape(role), role.id);
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
        await guard?.begin(tx, companyId);
        // Waits for in-flight user assignments to this role, so the scope check below sees them.
        await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} AND company_id = ${companyId} FOR UPDATE`;
        const existing = await tx.role.findFirst({
          where: { id: roleId, companyId },
          select: {
            id: true,
            visibilityScope: true,
            editRequiresApproval: true,
            deleteRequiresApproval: true,
            permissions: { select: { area: true, level: true } },
          },
        });
        if (!existing) throw this.roleNotFound();
        const before = roleShape(existing);
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
        await guard?.check(tx, companyId, before, roleShape(role), roleId);
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
 * - Locks the company and re-reads the member's role (see auth/member-guard.ts).
 * - Nobody changes the role they hold.
 * - Nobody touches a role above them in any area or with fewer approvals, or makes one so.
 * - A member write never leaves the company without an active role editor.
 */
function memberGuard(auth: RequestAuth): RoleGuard | undefined {
  if (auth.actor !== 'member') return undefined;
  let actor: ActorCeiling | null = null;
  let editorsBefore = 0;
  return {
    async begin(tx, companyId) {
      await lockCompanyAdmins(tx, companyId);
      actor = await lockActorCeiling(tx, auth);
      if (!actor || actor.permissions.roles !== 'WRITE' || actor.visibility !== VisibilityScope.ALL_BRANCHES) {
        throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'You do not have permission for this action.' });
      }
      editorsBefore = await countRoleEditors(tx, companyId);
    },
    async check(tx, companyId, before, after, roleId) {
      if (!actor) throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'You do not have permission for this action.' });
      if (roleId === actor.roleId) {
        throw new ConflictException({ code: ErrorCode.OWN_ROLE, message: 'You cannot change your own role.' });
      }
      const message = 'A role cannot have more permissions than yours.';
      if (before) assertWithin(actor, before, message);
      assertWithin(actor, after, message);
      assertKeepsRoleEditors(editorsBefore, await countRoleEditors(tx, companyId));
    },
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
