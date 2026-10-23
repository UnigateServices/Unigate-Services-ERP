import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { VisibilityScope } from '@prisma/client';
import {
  ErrorCode,
  atLeast,
  emptyPermissionMap,
  isPermissionArea,
  isPermissionLevel,
  platformSupportPermissions,
  type PermissionArea,
  type PermissionLevel,
  type PermissionMap,
} from '@unigate/shared';
import type { RequestAuth } from './auth.service';

/**
 * The current user's access to one area of the session company.
 * Every permission check goes through accessFor or requireAccess. Code never compares role keys.
 */
export type AreaAccess = {
  actor: 'member' | 'platform';
  companyId: string;
  area: PermissionArea;
  level: PermissionLevel;
  visibility: VisibilityScope;
  /** Membership location. Null for ALL_BRANCHES and for a platform operator. */
  locationId: string | null;
  /** Null for a platform operator, who has no membership. */
  membershipId: string | null;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

/** Builds the full map from stored rows. A missing area is NONE. Unknown areas are ignored. */
export function toPermissionMap(rows: { area: string; level: string }[]): PermissionMap {
  const map = emptyPermissionMap();
  for (const row of rows) {
    if (isPermissionArea(row.area) && isPermissionLevel(row.level)) map[row.area] = row.level;
  }
  return map;
}

/** The permission map for the session company, or null for an operator outside support. */
export function permissionMapFor(auth: RequestAuth): PermissionMap | null {
  if (auth.actor === 'platform') return auth.actingCompanyId ? platformSupportPermissions() : null;
  return auth.membership?.permissions ?? null;
}

export function accessFor(auth: RequestAuth, area: PermissionArea): AreaAccess {
  if (auth.actor === 'platform') {
    if (!auth.actingCompanyId) {
      throw new ConflictException({ code: ErrorCode.CONFLICT, message: 'A support company is required.' });
    }
    return {
      actor: 'platform',
      companyId: auth.actingCompanyId,
      area,
      level: platformSupportPermissions()[area],
      visibility: VisibilityScope.ALL_BRANCHES,
      locationId: null,
      membershipId: null,
      editRequiresApproval: false,
      deleteRequiresApproval: false,
    };
  }
  const membership = auth.membership;
  if (!membership) {
    throw new UnauthorizedException({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication is required.' });
  }
  return {
    actor: 'member',
    companyId: membership.companyId,
    area,
    level: membership.permissions[area],
    visibility: membership.visibility,
    locationId: membership.locationId,
    membershipId: membership.membershipId,
    editRequiresApproval: membership.editRequiresApproval,
    deleteRequiresApproval: membership.deleteRequiresApproval,
  };
}

/**
 * Company administration that changes structure (create or edit branches, roles, permissions)
 * needs the level and the ALL_BRANCHES scope. A platform operator in support always has both.
 */
export function requireCompanyAdmin(auth: RequestAuth, area: 'branches' | 'roles'): AreaAccess {
  const access = requireAccess(auth, area, 'WRITE');
  if (access.visibility !== VisibilityScope.ALL_BRANCHES) {
    throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'This needs access to all branches.' });
  }
  return access;
}

/** True when every area in `next` is at or below the same area in `ceiling`. */
export function withinLevels(ceiling: PermissionMap, next: PermissionMap) {
  return (Object.keys(next) as PermissionArea[]).every((area) => atLeast(ceiling[area], next[area]));
}

/** Same as accessFor, and refuses with 403 FORBIDDEN below `minimum`. */
export function requireAccess(auth: RequestAuth, area: PermissionArea, minimum: PermissionLevel): AreaAccess {
  const access = accessFor(auth, area);
  if (!atLeast(access.level, minimum)) {
    throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'You do not have permission for this action.' });
  }
  return access;
}
