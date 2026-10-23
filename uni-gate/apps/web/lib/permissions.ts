import { atLeast, type PermissionArea, type PermissionLevel } from '@/lib/permission-areas';
import type { AppSession, Location, Membership, Role, VisibilityScope } from '@/types/auth';

/** Mirrors the server check. The server still decides; this only hides what would be refused. */
export function hasLevel(session: AppSession, area: PermissionArea, minimum: PermissionLevel) {
  if (isPlatform(session)) return true;
  return atLeast(session.permissions?.[area], minimum);
}

export function canSeeBranches(session: AppSession) {
  return hasLevel(session, 'branches', 'READ');
}

export function canSeeUsers(session: AppSession) {
  return hasLevel(session, 'users', 'READ');
}

export function isPlatform(session: AppSession) {
  return session.actor === 'platform';
}

/** Phase 11: branches Write and all-branch scope. The server applies the same rule. */
export function canCreateBranch(session: AppSession) {
  return isPlatform(session) || (hasLevel(session, 'branches', 'WRITE') && session.visibility === 'ALL_BRANCHES');
}

/** Phase 11: roles Write and all-branch scope. The server applies the same rule. */
export function canEditRoles(session: AppSession) {
  return isPlatform(session) || (hasLevel(session, 'roles', 'WRITE') && session.visibility === 'ALL_BRANCHES');
}

export function canManageUsers(session: AppSession) {
  return isPlatform(session) || session.canManageUsers;
}

export function canSeeRoles(session: AppSession) {
  return hasLevel(session, 'roles', 'READ') || canManageUsers(session);
}

export function seesAllBranches(session: AppSession) {
  return isPlatform(session) || session.visibility === 'ALL_BRANCHES' || session.visibility === 'PLATFORM';
}

export function visibleLocations(session: AppSession, locations: Location[], companyId: string) {
  const rows = locations.filter((item) => item.companyId === companyId);
  if (seesAllBranches(session)) return rows;
  return rows.filter((item) => item.id === session.locationId);
}

export function visibleMemberships(
  session: AppSession,
  memberships: Membership[],
  roles: Role[],
  companyId: string,
) {
  const rows = memberships.filter((item) => item.companyId === companyId);
  if (!canSeeUsers(session)) return [];
  if (isPlatform(session) || session.visibility === 'ALL_BRANCHES' || session.visibility === 'PLATFORM') {
    return rows;
  }
  if (session.visibility === 'BRANCH') {
    return rows.filter((item) => item.locationId === session.locationId);
  }
  return rows.filter((item) => item.userId === session.userId);
}

export function assignableRoles(session: AppSession, roles: Role[]) {
  if (isPlatform(session) || session.visibility === 'ALL_BRANCHES' || session.visibility === 'PLATFORM') {
    return roles;
  }
  return roles.filter((role) => role.visibilityScope !== 'ALL_BRANCHES');
}

export function locationLocked(session: AppSession) {
  return !isPlatform(session) && session.visibility === 'BRANCH';
}

export function scopeLabelKey(scope: VisibilityScope) {
  if (scope === 'ALL_BRANCHES') return 'scopeAll' as const;
  if (scope === 'BRANCH') return 'scopeBranch' as const;
  return 'scopeOwn' as const;
}
