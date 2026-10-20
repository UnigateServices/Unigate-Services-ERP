import { api } from '@/lib/api';
import type { ModuleKey } from '@/types/auth';

export type SessionModule = {
  key: ModuleKey;
  enabled: boolean;
  ready: boolean;
};

export type PlatformModule = SessionModule & {
  companyId: string;
};

type Failure = { ok: false; code: string };

function failed(status: number, body: unknown): Failure {
  const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : 'network';
  if (status === 0) return { ok: false, code: 'network' };
  return { ok: false, code };
}

export async function listSessionModules() {
  try {
    const { status, body } = await api<{ items: SessionModule[] }>('/api/modules');
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}

export async function getSessionModule(key: string) {
  try {
    const { status, body } = await api<{ key: ModuleKey; ready: boolean }>(`/api/modules/${encodeURIComponent(key)}`);
    if (status !== 200 || !body) return failed(status, body);
    return { ok: true as const, module: body };
  } catch {
    return failed(0, null);
  }
}

export async function listPlatformModules(companyId: string) {
  try {
    const { status, body } = await api<{ items: PlatformModule[] }>(`/api/platform/companies/${companyId}/modules`);
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}

export async function updatePlatformModules(companyId: string, modules: { key: ModuleKey; enabled: boolean }[]) {
  try {
    const { status, body } = await api<{ items: PlatformModule[] }>(`/api/platform/companies/${companyId}/modules`, {
      method: 'PUT',
      body: { modules },
    });
    if (status !== 200 || !body?.items) return failed(status, body);
    return { ok: true as const, items: body.items };
  } catch {
    return failed(0, null);
  }
}
