import { readFileSync } from 'fs';
import path from 'path';
import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://localhost:5433/unigate',
  API_PORT: '3001',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('session secret configuration', () => {
  it('requires AUTH_SECRET from the environment and rejects a short secret in production', () => {
    expect(() => validateEnv(base)).toThrow(/AUTH_SECRET must be at least 32 characters/);
    expect(() => validateEnv({ ...base, AUTH_SECRET: 'short-secret', NODE_ENV: 'production' })).toThrow(
      /AUTH_SECRET must be at least 32 characters/,
    );
    expect(() =>
      validateEnv({ ...base, AUTH_SECRET: 'x'.repeat(32), NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('does not fall back to a hardcoded session secret', () => {
    const source = readFileSync(path.join(__dirname, 'env.ts'), 'utf8');
    expect(source).not.toMatch(/AUTH_SECRET\s*\?\?/);
    expect(source).not.toMatch(/AUTH_SECRET\s*\|\|/);
  });
});
