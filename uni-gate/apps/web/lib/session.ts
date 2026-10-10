import { api } from '@/lib/api';
import type { AppSession } from '@/types/auth';

const STALE_SUPPORT_KEY = 'ug_support_company';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

type ActingCompany = {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED';
};

type MeResponse =
  | {
      actor: 'platform';
      userId: string;
      name: string;
      actingCompany: ActingCompany | null;
    }
  | {
      actor: 'member';
      userId: string;
      name: string;
      company: { id: string; name: string; code: string };
      roleKey: string;
      roleName: string;
      locationId: string | null;
      locationName: string | null;
      visibility: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';
      canManageUsers: boolean;
    };

export async function loadSession(): Promise<AppSession | null> {
  clearStaleSupportKey();
  try {
    const { status, body } = await api<MeResponse>('/api/auth/me');
    if (status !== 200 || !body) return null;
    return toSession(body);
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // The local session is still treated as signed out.
  }
  clearStaleSupportKey();
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const { status, body } = await api<{ code?: string }>('/api/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  if (status === 204) return { ok: true as const };
  return { ok: false as const, code: body?.code ?? 'UNAUTHORIZED' };
}

export async function leaveSupportCompany(companyId: string) {
  try {
    const { status, body } = await api<{ code?: string }>(`/api/platform/companies/${companyId}/leave`, { method: 'POST' });
    if (status !== 200) return { ok: false as const, code: body?.code ?? 'network' };
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: 'network' };
  }
}

function toSession(me: MeResponse): AppSession {
  const expiresAt = Date.now() + EIGHT_HOURS_MS;
  if (me.actor === 'platform') {
    return {
      actor: 'platform',
      userId: me.userId,
      name: me.name,
      companyId: me.actingCompany?.id ?? null,
      roleKey: null,
      roleName: null,
      locationId: null,
      visibility: 'PLATFORM',
      canManageUsers: true,
      expiresAt,
      actingCompany: me.actingCompany,
    };
  }
  return {
    actor: 'member',
    userId: me.userId,
    name: me.name,
    companyId: me.company.id,
    roleKey: me.roleKey,
    roleName: me.roleName,
    locationId: me.locationId,
    visibility: me.visibility,
    canManageUsers: me.canManageUsers,
    expiresAt,
    actingCompany: null,
  };
}

function clearStaleSupportKey() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STALE_SUPPORT_KEY);
}
