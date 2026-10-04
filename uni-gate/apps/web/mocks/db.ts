import { seedDatabase } from '@/mocks/seed';
import type { MockDatabase } from '@/types/auth';

const DB_KEY = 'ug_mock_db';

export function loadDb(): MockDatabase {
  if (typeof window === 'undefined') return seedDatabase();
  const raw = window.localStorage.getItem(DB_KEY);
  if (!raw) {
    const seeded = seedDatabase();
    window.localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as MockDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.companies)) {
      const seeded = seedDatabase();
      window.localStorage.setItem(DB_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = seedDatabase();
    window.localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

export function saveDb(db: MockDatabase) {
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
