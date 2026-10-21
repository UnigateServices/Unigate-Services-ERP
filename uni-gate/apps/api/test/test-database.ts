/** Disposable test database on the local PostgreSQL. Never the development database `unigate`. */
export const TEST_DATABASE_NAME = 'unigate_auth_test';
export const TEST_DATABASE_URL = `postgresql://unigate:unigate@localhost:5433/${TEST_DATABASE_NAME}?schema=public`;
export const ADMIN_DATABASE_URL = 'postgresql://unigate:unigate@localhost:5433/postgres?schema=public';
