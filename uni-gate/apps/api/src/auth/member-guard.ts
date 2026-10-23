import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, UserKind, UserStatus, VisibilityScope } from '@prisma/client';
import { ErrorCode, type PermissionMap } from '@unigate/shared';
import { toPermissionMap, withinLevels } from './access';
import type { RequestAuth } from './auth.service';

/**
 * Decision L, for writes made by a member (never by a platform operator, who can always repair a company).
 *
 * Every member write that changes users or roles runs these, inside its transaction:
 * 1. lockCompanyAdmins: one lock per company, taken first, so two members cannot each remove
 *    the other's admin rights at the same time.
 * 2. lockActorCeiling: re-reads the acting member's current role and holds it until commit,
 *    so a request that started before the member was demoted cannot use the old levels.
 * 3. assertWithin: nothing the member creates, edits, assigns, or acts on may be above them.
 * 4. assertKeepsRoleEditors: a member action never leaves the company without an active
 *    user who can edit roles.
 */

export type RoleShape = {
  permissions: PermissionMap;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

export type ActorCeiling = RoleShape & { roleId: string; userId: string; visibility: VisibilityScope };

/** FOR NO KEY UPDATE: serializes admin-changing writes per company without blocking inserts that reference it. */
export async function lockCompanyAdmins(tx: Prisma.TransactionClient, companyId: string) {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR NO KEY UPDATE`;
}

/** The acting member's current role, locked FOR SHARE until commit. Null for a platform operator. */
export async function lockActorCeiling(tx: Prisma.TransactionClient, auth: RequestAuth): Promise<ActorCeiling | null> {
  if (auth.actor !== 'member' || !auth.membership) return null;
  const { membershipId, companyId } = auth.membership;
  const rows = await tx.$queryRaw<{ role_id: string }[]>`
    SELECT role_id FROM memberships WHERE id = ${membershipId} AND company_id = ${companyId} FOR SHARE`;
  const roleId = rows[0]?.role_id;
  if (!roleId) throw forbidden();
  await tx.$queryRaw`SELECT id FROM roles WHERE id = ${roleId} AND company_id = ${companyId} FOR SHARE`;
  const role = await tx.role.findFirst({
    where: { id: roleId, companyId },
    include: { permissions: { select: { area: true, level: true } } },
  });
  if (!role) throw forbidden();
  return {
    roleId,
    userId: auth.userId,
    visibility: role.visibilityScope,
    permissions: toPermissionMap(role.permissions),
    editRequiresApproval: role.editRequiresApproval,
    deleteRequiresApproval: role.deleteRequiresApproval,
  };
}

/** A role is within the actor when no area is higher and it needs at least the approvals the actor needs. */
export function isWithin(actor: RoleShape, role: RoleShape) {
  return (
    withinLevels(actor.permissions, role.permissions) &&
    (!actor.editRequiresApproval || role.editRequiresApproval) &&
    (!actor.deleteRequiresApproval || role.deleteRequiresApproval)
  );
}

export function assertWithin(actor: ActorCeiling | null, role: RoleShape, message: string) {
  if (actor && !isWithin(actor, role)) throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

/** Active customer users who can edit roles: roles WRITE with all-branch scope. */
export function countRoleEditors(tx: Prisma.TransactionClient, companyId: string) {
  return tx.membership.count({
    where: {
      companyId,
      user: { kind: UserKind.MEMBER, status: UserStatus.ACTIVE },
      role: {
        visibilityScope: VisibilityScope.ALL_BRANCHES,
        permissions: { some: { area: 'roles', level: 'WRITE' } },
      },
    },
  });
}

/** Refuses only a change from some role editors to none. A company that had none is not blocked. */
export function assertKeepsRoleEditors(before: number, after: number) {
  if (before > 0 && after === 0) {
    throw new ConflictException({
      code: ErrorCode.LAST_ROLE_EDITOR,
      message: 'This would leave the company without anyone who can manage roles.',
    });
  }
}

export function roleShape(role: {
  permissions: { area: string; level: string }[];
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
}): RoleShape {
  return {
    permissions: toPermissionMap(role.permissions),
    editRequiresApproval: role.editRequiresApproval,
    deleteRequiresApproval: role.deleteRequiresApproval,
  };
}

function forbidden() {
  return new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'You do not have permission for this action.' });
}
