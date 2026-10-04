import { isPastDate } from '@/lib/dates';
import { loadDb } from '@/mocks/db';
import { writeMemberSession } from '@/lib/session';
import type { LoginFailureCode } from '@/types/auth';

const ATTEMPTS_KEY = 'ug_customer_login_attempts';
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Attempt = { count: number; lockedUntil: number | null };
type AttemptBook = Record<string, Attempt>;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function readBook(): AttemptBook {
  const raw = window.localStorage.getItem(ATTEMPTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as AttemptBook;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBook(book: AttemptBook) {
  window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(book));
}

export function loginCustomer(companyCode: string, username: string, password: string) {
  const key = `${normalize(companyCode)}:${normalize(username)}`;
  const book = readBook();
  const current = book[key] ?? { count: 0, lockedUntil: null };
  if (current.lockedUntil && current.lockedUntil > Date.now()) {
    return { ok: false as const, code: 'LOCKED' as LoginFailureCode };
  }
  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    current.count = 0;
    current.lockedUntil = null;
  }

  const db = loadDb();
  const company = db.companies.find((item) => item.code === normalize(companyCode));
  const membership = company
    ? db.memberships.find((item) => {
        if (item.companyId !== company.id) return false;
        const user = db.users.find((row) => row.id === item.userId);
        return user?.name.toLocaleLowerCase() === normalize(username);
      })
    : undefined;
  const user = membership ? db.users.find((item) => item.id === membership.userId) : undefined;
  const passwordMatches = user?.password === password;

  if (!company || !membership || !user || !passwordMatches) {
    current.count += 1;
    if (current.count >= MAX_FAILURES) {
      current.lockedUntil = Date.now() + LOCK_MS;
      current.count = 0;
    }
    book[key] = current;
    writeBook(book);
    return { ok: false as const, code: 'WRONG_CREDENTIALS' as LoginFailureCode };
  }

  if (company.status === 'SUSPENDED') {
    return { ok: false as const, code: 'COMPANY_SUSPENDED' as LoginFailureCode };
  }
  if (isPastDate(company.expiresOn)) {
    return { ok: false as const, code: 'SUBSCRIPTION_EXPIRED' as LoginFailureCode };
  }
  if (user.status === 'INACTIVE') {
    return { ok: false as const, code: 'INACTIVE' as LoginFailureCode };
  }

  const role = db.roles.find((item) => item.id === membership.roleId);
  if (!role) return { ok: false as const, code: 'WRONG_CREDENTIALS' as LoginFailureCode };

  delete book[key];
  writeBook(book);
  const session = writeMemberSession({
    userId: user.id,
    name: user.name,
    companyId: company.id,
    roleKey: role.key,
    roleName: role.name,
    locationId: membership.locationId,
    visibility: role.visibilityScope,
    canManageUsers: role.canManageUsers,
  });
  return { ok: true as const, session };
}
