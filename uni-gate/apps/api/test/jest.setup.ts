import { execSync } from 'child_process';
import path from 'path';

const databaseUrl = 'postgresql://unigate:unigate@localhost:5433/unigate_auth_test?schema=public';

process.env.DATABASE_URL = databaseUrl;
process.env.API_PORT ??= '3001';
process.env.AUTH_SECRET ??= 'test-auth-secret-0123456789abcdef';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.BCRYPT_COST ??= '4';
process.env.NODE_ENV ??= 'test';

const psql = path.join(process.env.LOCALAPPDATA ?? '', 'unigate-postgres', 'pgsql', 'bin', 'psql.exe');
const env = {
  ...process.env,
  PGPASSWORD: 'unigate',
  PGHOST: 'localhost',
  PGPORT: '5433',
  PGUSER: 'unigate',
};

const existing = execSync(`"${psql}" -d postgres -tA -c "SELECT 1 FROM pg_database WHERE datname = 'unigate_auth_test'"`, {
  env,
  encoding: 'utf8',
}).trim();

if (existing !== '1') {
  execSync(`"${psql}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE unigate_auth_test"`, { env, stdio: 'inherit' });
}

execSync('npx prisma migrate deploy --schema packages/database/prisma/schema.prisma', {
  cwd: path.resolve(__dirname, '../../..'),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});
