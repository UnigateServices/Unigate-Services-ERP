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
  return {
    DATABASE_URL: databaseUrl,
    API_PORT: String(portNumber),
  };
}
