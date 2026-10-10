import { api } from '@/lib/api';
import type { ModuleKey } from '@/types/auth';

export type PlatformCompany = {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED';
  priceUsd: string;
  expiresOn: string;
};

export type PlatformCompanyDetail = PlatformCompany & {
  counts: { branches: number; users: number };
  modules: { key: ModuleKey; enabled: boolean }[];
};

export type CompanyList = {
  items: PlatformCompany[];
  page: number;
  pageSize: number;
  total: number;
};

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

export async function listPlatformCompanies(query: { page: number; q?: string; status?: '' | 'ACTIVE' | 'SUSPENDED' }) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: '20' });
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  try {
    const { status, body } = await api<CompanyList>(`/api/platform/companies?${params.toString()}`);
    if (status !== 200 || !body) return failed(status, body);
    return { ok: true as const, list: body };
  } catch {
    return failed(0, null);
  }
}

export async function countPlatformCompanies(status: 'ACTIVE' | 'SUSPENDED') {
  const result = await listPlatformCompanies({ page: 1, status });
  if (!result.ok) return result;
  return { ok: true as const, total: result.list.total };
}

export async function getPlatformCompany(companyId: string) {
  try {
    const { status, body } = await api<PlatformCompanyDetail>(`/api/platform/companies/${companyId}`);
    if (status !== 200 || !body) return failed(status, body);
    return { ok: true as const, company: body };
  } catch {
    return failed(0, null);
  }
}

export async function createPlatformCompany(input: {
  name: string;
  code: string;
  priceUsd: string;
  expiresOn: string;
  preset: 'tradivia' | 'simple';
  modules: ModuleKey[];
}) {
  try {
    const { status, body } = await api<PlatformCompany & { code?: string }>('/api/platform/companies', {
      method: 'POST',
      body: input,
    });
    if ((status !== 200 && status !== 201) || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, company: body as PlatformCompany };
  } catch {
    return failed(0, null);
  }
}

export async function updatePlatformCompany(
  companyId: string,
  input: { name: string; code: string; priceUsd: string; expiresOn: string },
) {
  try {
    const { status, body } = await api<PlatformCompany>(`/api/platform/companies/${companyId}`, {
      method: 'PATCH',
      body: input,
    });
    if (status !== 200 || !body) return failed(status, body);
    return { ok: true as const, company: body };
  } catch {
    return failed(0, null);
  }
}

export async function enterPlatformCompany(companyId: string) {
  try {
    const { status, body } = await api<{ code?: string }>(`/api/platform/companies/${companyId}/enter`, { method: 'POST' });
    if (status !== 200) return { ok: false as const, code: body?.code ?? 'network' };
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: 'network' };
  }
}
export async function suspendPlatformCompany(companyId: string) {
  try {
    const { status, body } = await api<PlatformCompany>(`/api/platform/companies/${companyId}/suspend`, { method: 'POST' });
    if (status !== 200 && status !== 201) return failed(status, body);
    return { ok: true as const, company: body };
  } catch {
    return failed(0, null);
  }
}

export async function activatePlatformCompany(companyId: string, expiresOn: string) {
  try {
    const { status, body } = await api<PlatformCompany>(`/api/platform/companies/${companyId}/activate`, {
      method: 'POST',
      body: { expiresOn },
    });
    if (status !== 200 && status !== 201) return failed(status, body);
    return { ok: true as const, company: body };
  } catch {
    return failed(0, null);
  }
}
