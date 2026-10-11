import { api } from '@/lib/api';

export type CompanyRole = {
  id: string;
  key: string;
  name: string;
  canManageUsers: boolean;
  visibilityScope: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
};

type RoleList = { items: CompanyRole[] };

type RoleInput = {
  name: string;
  key: string;
  canManageUsers: boolean;
  visibilityScope: CompanyRole['visibilityScope'];
  editRequiresApproval: boolean;
  deleteRequiresApproval: boolean;
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
