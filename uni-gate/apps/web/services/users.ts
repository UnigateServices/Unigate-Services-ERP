import { api } from '@/lib/api';

export type CustomerUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  role: {
    id: string;
    key: string;
    name: string;
    visibilityScope: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';
    canManageUsers: boolean;
  };
  location: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' } | null;
};

export type UserList = {
  items: CustomerUser[];
  page: number;
  pageSize: number;
  total: number;
};

type UserWrite = {
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  locationId: string | null;
};

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

function query(input: { page: number; q?: string }) {
  const params = new URLSearchParams({ page: String(input.page), pageSize: '20' });
  if (input.q?.trim()) params.set('q', input.q.trim());
  return params.toString();
}

export async function listPlatformUsers(companyId: string, input: { page: number; q?: string }) {
  try {
    const { status, body } = await api<UserList>(`/api/platform/companies/${companyId}/users?${query(input)}`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, list: body };
  } catch {
    return failed(0, null);
  }
}

export async function getPlatformUser(companyId: string, userId: string) {
  try {
    const { status, body } = await api<CustomerUser>(`/api/platform/companies/${companyId}/users/${userId}`);
    if (status !== 200 || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function createPlatformUser(companyId: string, input: UserWrite & { password: string }) {
  try {
    const { status, body } = await api<CustomerUser>(`/api/platform/companies/${companyId}/users`, { method: 'POST', body: input });
    if ((status !== 200 && status !== 201) || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function updatePlatformUser(companyId: string, userId: string, input: UserWrite & { status: CustomerUser['status'] }) {
  try {
    const { status, body } = await api<CustomerUser>(`/api/platform/companies/${companyId}/users/${userId}`, {
      method: 'PATCH',
      body: input,
    });
    if (status !== 200 || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function resetPlatformPassword(companyId: string, userId: string, password: string) {
  try {
    const { status, body } = await api(`/api/platform/companies/${companyId}/users/${userId}/password`, {
      method: 'POST',
      body: { password },
    });
    if (status !== 204) return failed(status, body);
    return { ok: true as const };
  } catch {
    return failed(0, null);
  }
}

export async function listCustomerUsers(input: { page: number; q?: string }) {
  try {
    const { status, body } = await api<UserList>(`/api/users?${query(input)}`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, list: body };
  } catch {
    return failed(0, null);
  }
}

export async function getCustomerUser(userId: string) {
  try {
    const { status, body } = await api<CustomerUser>(`/api/users/${userId}`);
    if (status !== 200 || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function createCustomerUser(input: UserWrite & { password: string }) {
  try {
    const { status, body } = await api<CustomerUser>('/api/users', { method: 'POST', body: input });
    if ((status !== 200 && status !== 201) || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function updateCustomerUser(userId: string, input: UserWrite & { status: CustomerUser['status'] }) {
  try {
    const { status, body } = await api<CustomerUser>(`/api/users/${userId}`, { method: 'PATCH', body: input });
    if (status !== 200 || !body?.id) return failed(status, body);
    return { ok: true as const, user: body };
  } catch {
    return failed(0, null);
  }
}

export async function resetCustomerPassword(userId: string, password: string) {
  try {
    const { status, body } = await api(`/api/users/${userId}/password`, { method: 'POST', body: { password } });
    if (status !== 204) return failed(status, body);
    return { ok: true as const };
  } catch {
    return failed(0, null);
  }
}
