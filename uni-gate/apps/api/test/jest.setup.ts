// Runs before every test file. Database creation and migration run once per run in jest.global-setup.ts.
import { TEST_DATABASE_URL } from './test-database';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.API_PORT ??= '3001';
process.env.AUTH_SECRET ??= 'test-auth-secret-0123456789abcdef';
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.BCRYPT_COST ??= '4';
process.env.NODE_ENV ??= 'test';
