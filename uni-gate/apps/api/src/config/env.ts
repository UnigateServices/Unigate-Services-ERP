const DEV_WEB_ORIGIN = 'http://localhost:3000';

export function validateEnv(config: Record<string, unknown>) {
  const databaseUrl = config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }
  const port = config.API_PORT ?? '3001';
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber <= 0) {
    throw new Error('API_PORT must be a positive integer');
  }

  const secret = config.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters');
  }

  const origin = config.WEB_ORIGIN ?? DEV_WEB_ORIGIN;
  if (typeof origin !== 'string' || !/^https?:\/\/[^/\s]+$/.test(origin)) {
    throw new Error('WEB_ORIGIN must be an origin such as http://localhost:3000');
  }

  const nodeEnv = typeof config.NODE_ENV === 'string' && config.NODE_ENV ? config.NODE_ENV : 'development';
  const bcryptCost = config.BCRYPT_COST === undefined || config.BCRYPT_COST === '' ? 12 : Number(config.BCRYPT_COST);
  if (!Number.isInteger(bcryptCost) || bcryptCost < 4 || bcryptCost > 15) {
    throw new Error('BCRYPT_COST must be an integer from 4 to 15');
  }
  if (nodeEnv === 'production' && bcryptCost < 12) {
    throw new Error('BCRYPT_COST must be at least 12 in production');
  }

  return {
    DATABASE_URL: databaseUrl,
    API_PORT: String(portNumber),
    AUTH_SECRET: secret,
    WEB_ORIGIN: origin,
    NODE_ENV: nodeEnv,
    BCRYPT_COST: String(bcryptCost),
  };
}
