import type { AppSession, Location, Membership, Role, VisibilityScope } from '@/types/auth';

export function isPlatform(session: AppSession) {
  return session.actor === 'platform';
}

export function canCreateBranch(session: AppSession) {
  return isPlatform(session);
}

export function canEditRoles(session: AppSession) {
  return isPlatform(session);
}

export function canManageUsers(session: AppSession) {
  return isPlatform(session) || session.canManageUsers;
}

export function canSeeRoles(session: AppSession) {
  return canManageUsers(session);
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
  if (!canManageUsers(session)) return [];
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
