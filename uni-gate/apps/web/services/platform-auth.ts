import { NETWORK_FIXTURE_NAME, PLATFORM_OPERATORS } from '@/mocks/platform-operators';
import type { PlatformLoginResult } from '@/types/auth';

const ATTEMPTS_KEY = 'ug_platform_login_attempts';
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Attempt = { count: number; lockedUntil: number | null };
type AttemptBook = Record<string, Attempt>;

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function readBook(): AttemptBook {
  if (typeof window === 'undefined') return {};
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

const PASS_KEY = 'ug_platform_password_overrides';

function readOverrides(): Record<string, string> {
  const raw = window.localStorage.getItem(PASS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function storedPlatformPassword(operator: { id: string; password: string }) {
  return readOverrides()[operator.id] ?? operator.password;
}

export function setPlatformPassword(operatorId: string, password: string) {
  const overrides = readOverrides();
  overrides[operatorId] = password;
  window.localStorage.setItem(PASS_KEY, JSON.stringify(overrides));
}

export function loginPlatform(username: string, password: string): PlatformLoginResult {
  const key = normalizeName(username);
  if (key === NETWORK_FIXTURE_NAME) {
    throw new Error('NETWORK');
  }

  const book = readBook();
  const current = book[key] ?? { count: 0, lockedUntil: null };
  if (current.lockedUntil && current.lockedUntil > Date.now()) {
    return { ok: false, code: 'LOCKED' };
  }
  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    current.count = 0;
    current.lockedUntil = null;
  }

  const operator = PLATFORM_OPERATORS.find((item) => normalizeName(item.name) === key);
  const passwordMatches = operator ? storedPlatformPassword(operator) === password : false;

  if (!operator || !passwordMatches) {
    current.count += 1;
    if (current.count >= MAX_FAILURES) {
      current.lockedUntil = Date.now() + LOCK_MS;
      current.count = 0;
    }
    book[key] = current;
    writeBook(book);
    return { ok: false, code: 'WRONG_CREDENTIALS' };
  }

  if (operator.status === 'INACTIVE') {
    return { ok: false, code: 'INACTIVE' };
  }

  delete book[key];
  writeBook(book);
  return { ok: true, operator: { id: operator.id, name: operator.name } };
}
