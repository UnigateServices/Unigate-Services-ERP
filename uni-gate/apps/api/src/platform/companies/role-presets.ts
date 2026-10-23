import type { VisibilityScope } from '@prisma/client';
import { MODULE_KEYS, type PermissionArea, type PermissionLevel } from '@unigate/shared';

export type RoleTemplate = {
  key: string;
  name: string;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  /** Areas left out are NONE. */
  permissions: Partial<Record<PermissionArea, PermissionLevel>>;
};

function everyModule(level: PermissionLevel): Partial<Record<PermissionArea, PermissionLevel>> {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, level]));
}

/**
 * Starting roles for a new company. A starting point only: the operator (and later the
 * company manager) changes names and levels per company. Code never checks these keys.
 * Levels follow docs/FINANCE_MERGE_PLAN.md decision E.
 */
export const ROLE_PRESETS: Record<'tradivia' | 'simple', RoleTemplate[]> = {
  tradivia: [
    {
      key: 'GENERAL_MANAGER',
      name: 'مدير عام',
      visibilityScope: 'ALL_BRANCHES',
      editRequiresApproval: false,
      deleteRequiresApproval: false,
      permissions: { users: 'WRITE', branches: 'WRITE', roles: 'WRITE', finance: 'ADMIN' },
    },
    {
      key: 'MONITOR',
      name: 'مراقب',
      visibilityScope: 'ALL_BRANCHES',
      editRequiresApproval: false,
      deleteRequiresApproval: false,
      permissions: { users: 'READ', branches: 'READ', finance: 'READ' },
    },
    {
      key: 'SUPERVISOR',
      name: 'مشرف',
      visibilityScope: 'BRANCH',
      editRequiresApproval: false,
      deleteRequiresApproval: false,
      permissions: { users: 'WRITE', branches: 'READ', finance: 'APPROVE' },
    },
    {
      key: 'EMPLOYEE',
      name: 'موظف',
      visibilityScope: 'OWN',
      editRequiresApproval: true,
      deleteRequiresApproval: true,
      permissions: { branches: 'READ', finance: 'WRITE' },
    },
  ],
  simple: [
    {
      key: 'OWNER',
      name: 'مالك',
      visibilityScope: 'ALL_BRANCHES',
      editRequiresApproval: false,
      deleteRequiresApproval: false,
      permissions: { users: 'WRITE', branches: 'WRITE', roles: 'WRITE', ...everyModule('ADMIN') },
    },
    {
      key: 'STAFF',
      name: 'موظف',
      visibilityScope: 'BRANCH',
      editRequiresApproval: true,
      deleteRequiresApproval: true,
      permissions: { branches: 'READ', ...everyModule('WRITE') },
    },
  ],
};

/** Permission rows for one created role. NONE is never stored. */
export function presetPermissionRows(companyId: string, roleId: string, template: RoleTemplate) {
  return Object.entries(template.permissions)
    .filter(([, level]) => level && level !== 'NONE')
    .map(([area, level]) => ({ companyId, roleId, area, level: level as Exclude<PermissionLevel, 'NONE'> }));
}
