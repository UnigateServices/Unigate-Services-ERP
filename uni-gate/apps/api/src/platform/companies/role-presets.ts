import type { VisibilityScope } from '@prisma/client';

export type RoleTemplate = {
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: VisibilityScope;
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

/** Same presets as the platform company form. Not a global permission model. */
export const ROLE_PRESETS: Record<'tradivia' | 'simple', RoleTemplate[]> = {
  tradivia: [
    { key: 'GENERAL_MANAGER', name: 'مدير عام', canManageUsers: true, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
    { key: 'MONITOR', name: 'مراقب', canManageUsers: false, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
    { key: 'SUPERVISOR', name: 'مشرف', canManageUsers: true, visibilityScope: 'BRANCH', editRequiresApproval: false, deleteRequiresApproval: false },
    { key: 'EMPLOYEE', name: 'موظف', canManageUsers: false, visibilityScope: 'OWN', editRequiresApproval: true, deleteRequiresApproval: true },
  ],
  simple: [
    { key: 'OWNER', name: 'مالك', canManageUsers: true, visibilityScope: 'ALL_BRANCHES', editRequiresApproval: false, deleteRequiresApproval: false },
    { key: 'STAFF', name: 'موظف', canManageUsers: false, visibilityScope: 'BRANCH', editRequiresApproval: true, deleteRequiresApproval: true },
  ],
};
