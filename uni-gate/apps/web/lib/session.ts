import { api } from '@/lib/api';
import type { AppSession } from '@/types/auth';

const SUPPORT_KEY = 'ug_support_company';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

type MeResponse =
  | {
      actor: 'platform';
      userId: string;
      name: string;
      actingCompanyId: string | null;
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
    // The support cursor is still cleared below.
  }
  forgetSupportCompany();
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const { status, body } = await api<{ code?: string }>('/api/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  if (status === 204) return { ok: true as const };
  return { ok: false as const, code: body?.code ?? 'UNAUTHORIZED' };
}

/** Client-only company cursor for the mock support screens. It is not the authentication cookie. */
export function writeSupportSession(current: AppSession, companyId: string): AppSession {
  window.localStorage.setItem(SUPPORT_KEY, companyId);
  return {
    ...current,
    actor: 'platform',
    companyId,
    roleKey: null,
    roleName: null,
    locationId: null,
    visibility: 'PLATFORM',
    canManageUsers: true,
  };
}

export function clearSupportCompany(current: AppSession): AppSession {
  forgetSupportCompany();
  return {
    ...current,
    companyId: null,
    roleKey: null,
    roleName: null,
    locationId: null,
    visibility: 'PLATFORM',
    canManageUsers: true,
  };
}

export function forgetSupportCompany() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SUPPORT_KEY);
}

function toSession(me: MeResponse): AppSession {
  const expiresAt = Date.now() + EIGHT_HOURS_MS;
  if (me.actor === 'platform') {
    return {
      actor: 'platform',
      userId: me.userId,
      name: me.name,
      companyId: readSupportCompanyId(),
      roleKey: null,
      roleName: null,
      locationId: null,
      visibility: 'PLATFORM',
      canManageUsers: true,
      expiresAt,
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
  };
}

function readSupportCompanyId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SUPPORT_KEY);
}
