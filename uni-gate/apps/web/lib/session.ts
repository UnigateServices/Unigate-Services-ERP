import type { PlatformSession } from '@/types/auth';

const SESSION_KEY = 'ug_session';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export function readPlatformSession(): PlatformSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PlatformSession;
    if (parsed.actor !== 'platform' || parsed.companyId !== null) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function writePlatformSession(operator: { id: string; name: string }) {
  const session: PlatformSession = {
    actor: 'platform',
    userId: operator.id,
    name: operator.name,
    companyId: null,
    expiresAt: Date.now() + EIGHT_HOURS_MS,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
