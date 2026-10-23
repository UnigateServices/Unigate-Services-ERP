import type { ModuleKey } from '@/types/auth';

/*
 * Mirror of packages/shared/src/permissions.ts. The web app does not import @unigate/shared,
 * so keep both lists in the same order when an area is added.
 */
export const PERMISSION_LEVELS = ['NONE', 'READ', 'WRITE', 'APPROVE', 'ADMIN'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const ADMIN_AREAS = ['users', 'branches', 'roles'] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

export const MODULE_AREAS: readonly ModuleKey[] = ['finance', 'exchange', 'gold', 'aviation', 'engineering', 'hr'];

export type PermissionArea = AdminArea | ModuleKey;
export type PermissionMap = Record<PermissionArea, PermissionLevel>;

export function isAdminArea(area: PermissionArea): area is AdminArea {
  return (ADMIN_AREAS as readonly string[]).includes(area);
}

export function allowedLevels(area: PermissionArea): readonly PermissionLevel[] {
  return isAdminArea(area) ? ['NONE', 'READ', 'WRITE'] : PERMISSION_LEVELS;
}

export function atLeast(level: PermissionLevel | undefined, minimum: PermissionLevel) {
  return PERMISSION_LEVELS.indexOf(level ?? 'NONE') >= PERMISSION_LEVELS.indexOf(minimum);
}
