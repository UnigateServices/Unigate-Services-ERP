import type { AppSession } from '@/types/auth';

const SESSION_KEY = 'ug_session';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function expired(expiresAt: number) {
  return typeof expiresAt !== 'number' || expiresAt <= Date.now();
}

export function readSession(): AppSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    if (parsed.actor !== 'platform' && parsed.actor !== 'member') return null;
    if (!parsed.userId || !parsed.name || expired(parsed.expiresAt ?? 0)) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      actor: parsed.actor,
      userId: parsed.userId,
      name: parsed.name,
      companyId: parsed.companyId ?? null,
      roleKey: parsed.roleKey ?? null,
      roleName: parsed.roleName ?? null,
      locationId: parsed.locationId ?? null,
      visibility: parsed.visibility ?? (parsed.actor === 'platform' ? 'PLATFORM' : 'OWN'),
      canManageUsers: parsed.canManageUsers ?? parsed.actor === 'platform',
      expiresAt: parsed.expiresAt ?? 0,
    };
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function readPlatformSession() {
  const session = readSession();
  if (!session || session.actor !== 'platform') return null;
  return session;
}

function persist(session: AppSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function writePlatformSession(operator: { id: string; name: string }) {
  return persist({
    actor: 'platform',
    userId: operator.id,
    name: operator.name,
    companyId: null,
    roleKey: null,
    roleName: null,
    locationId: null,
    visibility: 'PLATFORM',
    canManageUsers: true,
    expiresAt: Date.now() + EIGHT_HOURS_MS,
  });
}

export function writeMemberSession(input: {
  userId: string;
  name: string;
  companyId: string;
  roleKey: string;
  roleName: string;
  locationId: string | null;
  visibility: AppSession['visibility'];
  canManageUsers: boolean;
}) {
  return persist({
    actor: 'member',
    ...input,
    expiresAt: Date.now() + EIGHT_HOURS_MS,
  });
}

export function writeSupportSession(current: AppSession, companyId: string) {
  return persist({
    ...current,
    actor: 'platform',
    companyId,
    roleKey: null,
    roleName: null,
    locationId: null,
    visibility: 'PLATFORM',
    canManageUsers: true,
    expiresAt: Date.now() + EIGHT_HOURS_MS,
  });
}

export function clearSupportCompany(current: AppSession) {
  return persist({
    ...current,
    companyId: null,
    roleKey: null,
    roleName: null,
    locationId: null,
    visibility: 'PLATFORM',
    canManageUsers: true,
  });
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
