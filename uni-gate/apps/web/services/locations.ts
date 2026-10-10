import { api } from '@/lib/api';

export type Branch = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
};

type BranchList = { items: Branch[] };

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

export async function listPlatformLocations(companyId: string) {
  try {
    const { status, body } = await api<BranchList>(`/api/platform/companies/${companyId}/locations`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}

export async function createPlatformLocation(companyId: string, name: string) {
  try {
    const { status, body } = await api<Branch>(`/api/platform/companies/${companyId}/locations`, {
      method: 'POST',
      body: { name },
    });
    if ((status !== 200 && status !== 201) || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, branch: body };
  } catch {
    return failed(0, null);
  }
}

export async function updatePlatformLocation(
  companyId: string,
  locationId: string,
  input: { name: string; status: 'ACTIVE' | 'INACTIVE' },
) {
  try {
    const { status, body } = await api<Branch>(`/api/platform/companies/${companyId}/locations/${locationId}`, {
      method: 'PATCH',
      body: input,
    });
    if (status !== 200 || !body || !('id' in body)) return failed(status, body);
    return { ok: true as const, branch: body };
  } catch {
    return failed(0, null);
  }
}

export async function listCustomerLocations() {
  try {
    const { status, body } = await api<BranchList>('/api/locations');
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}
