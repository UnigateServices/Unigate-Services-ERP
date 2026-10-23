import { api } from '@/lib/api';
import type { PermissionArea, PermissionLevel, PermissionMap } from '@/lib/permission-areas';

export type CompanyRole = {
  id: string;
  key: string;
  name: string;
  /** Derived on the server: users area at Write or higher. */
  canManageUsers: boolean;
  visibilityScope: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  /** Every area, None included. */
  permissions: PermissionMap;
};

type RoleList = { items: CompanyRole[] };

type RoleInput = {
  name: string;
  key: string;
  visibilityScope: CompanyRole['visibilityScope'];
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
  /** Supplied areas are replaced. Areas left out keep their level. */
  permissions?: { area: PermissionArea; level: PermissionLevel }[];
};

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

export async function listPlatformRoles(companyId: string) {
  try {
    const { status, body } = await api<RoleList>(`/api/platform/companies/${companyId}/roles`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}

export async function createPlatformRole(companyId: string, input: RoleInput) {
  try {
    const { status, body } = await api<CompanyRole>(`/api/platform/companies/${companyId}/roles`, {
      method: 'POST',
      body: input,
    });
    if ((status !== 200 && status !== 201) || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, role: body };
  } catch {
    return failed(0, null);
  }
}

export async function updatePlatformRole(companyId: string, roleId: string, input: RoleInput) {
  try {
    const { status, body } = await api<CompanyRole>(`/api/platform/companies/${companyId}/roles/${roleId}`, {
      method: 'PATCH',
      body: input,
    });
    if (status !== 200 || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, role: body };
  } catch {
    return failed(0, null);
  }
}

export async function listCustomerRoles() {
  try {
    const { status, body } = await api<RoleList>('/api/roles');
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}

/** Phase 11: company comes from the session. Needs roles Write and all-branch scope. */
export async function createCustomerRole(input: RoleInput) {
  try {
    const { status, body } = await api<CompanyRole>('/api/roles', { method: 'POST', body: input });
    if ((status !== 200 && status !== 201) || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, role: body };
  } catch {
    return failed(0, null);
  }
}

export async function updateCustomerRole(roleId: string, input: RoleInput) {
  try {
    const { status, body } = await api<CompanyRole>(`/api/roles/${roleId}`, { method: 'PATCH', body: input });
    if (status !== 200 || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, role: body };
  } catch {
    return failed(0, null);
  }
}
