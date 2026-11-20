export type E2EConfiguration = {
  databaseName: string;
  mongodbUri: string;
  baseUrl: string;
  token: string;
};

type Environment = Record<string, string | undefined>;

const TEST_DATABASE_NAME = /(?:^(?:test(?:ing)?|e2e)[_-]|[_-](?:test|e2e)$)/i;
const PRODUCTION_MARKERS = /prod(?:uction)?|live/i;
const LOCAL_MONGO_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateE2EConfiguration(
  env: Environment,
  baseUrl: string,
  args: string[],
): E2EConfiguration {
  if (!args.includes('--test-mode') || env.E2E_TEST_MODE !== '1') {
    throw new Error('E2E requires --test-mode and E2E_TEST_MODE=1.');
  }
  if (env.NODE_ENV === 'production' || env.VERCEL
    || [env.VERCEL_ENV, env.APP_ENV, env.DEPLOYMENT_ENV].some((value) => Boolean(value && PRODUCTION_MARKERS.test(value)))) {
    throw new Error('E2E refuses to run in a production deployment environment.');
  }
  if (env.DISABLE_EXTERNAL_NOTIFICATIONS !== '1' || env.E2E_DISABLE_WHATSAPP !== '1') {
    throw new Error('E2E requires email and WhatsApp delivery to be explicitly disabled.');
  }

  const databaseName = env.E2E_TEST_DATABASE_NAME?.trim();
  const mongodbUri = env.E2E_TEST_MONGODB_URI?.trim();
  const token = env.E2E_TEST_TOKEN;
  if (!databaseName || !TEST_DATABASE_NAME.test(databaseName) || PRODUCTION_MARKERS.test(databaseName)) {
    throw new Error('E2E_TEST_DATABASE_NAME must be a dedicated non-production test database name.');
  }
  if (env.MONGODB_DATABASE_NAME && env.MONGODB_DATABASE_NAME !== databaseName) {
    throw new Error('MONGODB_DATABASE_NAME conflicts with E2E_TEST_DATABASE_NAME.');
  }
  if (env.MONGODB_URI && env.MONGODB_URI !== mongodbUri) {
    throw new Error('MONGODB_URI is set separately; refusing ambiguous database configuration.');
  }
  if (!mongodbUri) throw new Error('E2E_TEST_MONGODB_URI is required; ordinary MONGODB_URI is not used as a fallback.');
  if (!token || token.length < 32) throw new Error('E2E_TEST_TOKEN must contain at least 32 characters.');

  let parsedUri: URL;
  try {
    parsedUri = new URL(mongodbUri);
  } catch {
    throw new Error('E2E_TEST_MONGODB_URI must be a valid MongoDB URI.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsedUri.protocol)) {
    throw new Error('E2E_TEST_MONGODB_URI must use mongodb:// or mongodb+srv://.');
  }
  let uriDatabaseName: string;
  try {
    uriDatabaseName = decodeURIComponent(parsedUri.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('E2E_TEST_MONGODB_URI has an invalid database path.');
  }
  if (uriDatabaseName !== databaseName) {
    throw new Error('E2E MongoDB URI database path must match E2E_TEST_DATABASE_NAME.');
  }
  if (!LOCAL_MONGO_HOSTS.has(parsedUri.hostname) || PRODUCTION_MARKERS.test(parsedUri.hostname)) {
    throw new Error('E2E only permits a loopback MongoDB host; remote databases are refused.');
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error('E2E base URL must be a local HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(parsedBaseUrl.hostname)) {
    throw new Error('E2E may only target localhost, 127.0.0.1, or ::1.');
  }

  if (!env.ADMIN_BOOTSTRAP_EMAIL?.trim() || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    throw new Error('Dedicated test owner credentials are required.');
  }

  return { databaseName, mongodbUri, baseUrl: parsedBaseUrl.origin, token };
}
