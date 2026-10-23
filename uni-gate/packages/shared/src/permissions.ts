import { MODULE_KEYS, type ModuleKey } from './modules';

/** Ordered: each level includes every level before it. */
export const PERMISSION_LEVELS = ['NONE', 'READ', 'WRITE', 'APPROVE', 'ADMIN'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** Company administration. These accept NONE, READ, or WRITE only. */
export const ADMIN_AREAS = ['users', 'branches', 'roles'] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

/**
 * Every area a role can hold a level in. One per company module, plus administration.
 * A new module adds its key to MODULE_KEYS and appears here with no table change.
 */
export const PERMISSION_AREAS = [...ADMIN_AREAS, ...MODULE_KEYS] as const;
export type PermissionArea = AdminArea | ModuleKey;

export type PermissionMap = Record<PermissionArea, PermissionLevel>;

const ADMIN_AREA_LEVELS: readonly PermissionLevel[] = ['NONE', 'READ', 'WRITE'];

export function isPermissionArea(value: string): value is PermissionArea {
  return (PERMISSION_AREAS as readonly string[]).includes(value);
}

export function isPermissionLevel(value: string): value is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(value);
}

export function isAdminArea(area: PermissionArea): area is AdminArea {
  return (ADMIN_AREAS as readonly string[]).includes(area);
}

export function allowedLevels(area: PermissionArea): readonly PermissionLevel[] {
  return isAdminArea(area) ? ADMIN_AREA_LEVELS : PERMISSION_LEVELS;
}

export function levelRank(level: PermissionLevel) {
  return PERMISSION_LEVELS.indexOf(level);
}

/** True when `level` is `minimum` or higher. */
export function atLeast(level: PermissionLevel, minimum: PermissionLevel) {
  return levelRank(level) >= levelRank(minimum);
}

/** A full map with every area at NONE. */
export function emptyPermissionMap(): PermissionMap {
  const map = {} as PermissionMap;
  for (const area of PERMISSION_AREAS) map[area] = 'NONE';
  return map;
}

/**
 * What a platform operator holds inside a support session: full company administration,
 * and read only in module data. Unigate manages the account, not the customer's books.
 */
export function platformSupportPermissions(): PermissionMap {
  const map = emptyPermissionMap();
  for (const area of PERMISSION_AREAS) map[area] = isAdminArea(area) ? 'WRITE' : 'READ';
  return map;
}
