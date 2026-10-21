import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ADMIN_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from './test-database';

/** Creates the disposable test database if needed and applies migrations, once per Jest run. */
export default async function globalSetup() {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_DATABASE_URL });
  try {
    const existing = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${TEST_DATABASE_NAME}`;
    if (existing.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy --schema packages/database/prisma/schema.prisma', {
    cwd: path.resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
