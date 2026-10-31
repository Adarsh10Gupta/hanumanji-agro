import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns';
import { db } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

const DATABASE = 'hanumanji_agro';
const COLLECTION = 'codex_health_checks';
const uri = process.env.MONGODB_URI;

function classify(error: unknown): string {
  const parts: string[] = [];
  let current: any = error;
  for (let depth = 0; current && depth < 6; depth++, current = current.cause) {
    parts.push(String(current.name || ''), String(current.code || ''), String(current.codeName || ''), String(current.message || ''));
  }
  const summary = parts.join(' ').toLowerCase();
  if (/querysrv|enotfound|eai_again|dns/.test(summary)) return 'DNS resolution failed; check the Atlas SRV hostname and local DNS/network.';
  if (/authentication failed|bad auth|code 18|code: 18/.test(summary)) return 'Authentication was rejected; verify the database username/password and percent-encoding of reserved password characters.';
  if (/mongoparseerror|invalid scheme|invalid connection string|uri malformed|invalid uri/.test(summary)) return 'Connection string parsing failed; verify the MongoDB URI format and percent-encoding.';
  if (/not authorized|unauthorized|code 13|code: 13/.test(summary)) return 'The database user connected but lacks permission for hanumanji_agro.';
  if (/serverselection|timed out|timeout|etimedout|econnrefused|network|socket/.test(summary)) return 'Server selection/network failed; check Atlas Network Access allow-list, outbound access, and cluster availability.';
  return 'MongoDB connection or health-check operation failed; inspect Atlas credentials, URI, network access, and database-user permissions.';
}

function assertSafeTarget(connectionString: string) {
  const match = connectionString.match(/^mongodb(?:\+srv)?:\/\/[^/?#]+(?:\/([^?#]*))?/i);
  if (!match) throw new Error('CONNECTION_STRING_INVALID');
  let uriDatabase = '';
  try { uriDatabase = decodeURIComponent(match[1] || '').toLowerCase(); } catch { throw new Error('CONNECTION_STRING_ENCODING_INVALID'); }
  const query = connectionString.includes('?') ? connectionString.slice(connectionString.indexOf('?') + 1) : '';
  const authSource = new URLSearchParams(query).get('authSource')?.toLowerCase() || '';
  if (uriDatabase === 'hisabsetu' || authSource === 'hisabsetu') throw new Error('UNSAFE_DATABASE_TARGET');
}

async function dnsPreflight(connectionString: string) {
  if (!connectionString.toLowerCase().startsWith('mongodb+srv://')) return;
  const authority = connectionString.match(/^mongodb\+srv:\/\/([^/?#]+)/i)?.[1];
  if (!authority) throw new Error('CONNECTION_STRING_INVALID');
  const host = authority.slice(authority.lastIndexOf('@') + 1).split(':')[0];
  if (!host || host.includes('%')) throw new Error('CONNECTION_STRING_INVALID');
  const resolver = new Resolver();
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => resolver.resolveSrv(`_mongodb._tcp.${host}`, error => error ? reject(error) : resolve())),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('DNS_CHECK_TIMEOUT')), 7000); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    resolver.cancel();
  }
}

async function main() {
  if (!uri) {
    console.error('MongoDB verification failed: MONGODB_URI was not loaded from the server environment.');
    process.exitCode = 1;
    return;
  }
  console.log('Environment: MONGODB_URI loaded; value withheld.');

  try { assertSafeTarget(uri); } catch (error) {
    const code = error instanceof Error ? error.message : '';
    console.error(code === 'UNSAFE_DATABASE_TARGET'
      ? 'MongoDB verification stopped: URI targets the protected HisabSetu database; no connection or write was attempted.'
      : 'MongoDB verification failed: MONGODB_URI has an invalid format or encoding; no connection or write was attempted.');
    process.exitCode = 1;
    return;
  }

  try { await dnsPreflight(uri); } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^E[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : error instanceof Error && error.message === 'DNS_CHECK_TIMEOUT' ? 'DNS_CHECK_TIMEOUT' : 'DNS_ERROR';
    console.error(`MongoDB verification unsuccessful: ${classify(error)}`);
    console.error(`DNS result: ${code} (hostname and URI withheld).`);
    console.log(`Target database: ${DATABASE}`);
    console.log('DNS preflight: failed; no database connection or write was attempted.');
    process.exitCode = 1;
    return;
  }

  let connection: Awaited<ReturnType<typeof db>> | undefined;
  let writeAcknowledged = false;
  let readMatched = false;
  let cleanupConfirmed = false;
  let checks: any;
  const testId = `codex-${randomUUID()}`;

  try {
    let connectionTimeout: NodeJS.Timeout | undefined;
    try {
      connection = await Promise.race([
        db(),
        new Promise<never>((_, reject) => {
          connectionTimeout = setTimeout(() => reject(new Error('CONNECTION_TIMEOUT')), 20000);
          connectionTimeout.unref();
        }),
      ]);
    } finally {
      if (connectionTimeout) clearTimeout(connectionTimeout);
    }
    const database = connection.connection.db;
    if (!database || database.databaseName !== DATABASE) throw new Error('DATABASE_NAME_MISMATCH');

    await database.command({ ping: 1 });
    checks = database.collection(COLLECTION);
    const write = await checks.insertOne({ _id: testId, kind: 'temporary connection verification', createdAt: new Date() }, { writeConcern: { w: 'majority', wtimeoutMS: 10000 } });
    writeAcknowledged = write.acknowledged;
    const record = await checks.findOne({ _id: testId });
    readMatched = Boolean(record && record._id === testId && record.kind === 'temporary connection verification');
    if (!writeAcknowledged || !readMatched) throw new Error('HEALTH_CHECK_READ_WRITE_FAILED');
  } catch (error) {
    console.error(`MongoDB verification unsuccessful: ${classify(error)}`);
    process.exitCode = 1;
  } finally {
    if (connection?.connection.db && connection.connection.db.databaseName === DATABASE) {
      try {
        const result = await (checks || connection.connection.db.collection(COLLECTION)).deleteOne({ _id: testId });
        cleanupConfirmed = result.acknowledged && result.deletedCount === (writeAcknowledged ? 1 : 0);
      } catch {
        cleanupConfirmed = false;
      }
    }
    if (connection) {
      try { await connection.disconnect(); } catch { /* Keep output free of driver messages that can contain URI details. */ }
    }
  }

  if (process.exitCode) {
    console.log(`Target database: ${DATABASE}`);
    console.log(`Ping: ${connection ? 'attempted' : 'not established'}`);
    console.log(`Temporary write: ${writeAcknowledged ? 'acknowledged' : 'not acknowledged'}`);
    console.log(`Temporary read: ${readMatched ? 'matched' : 'not matched'}`);
    console.log(`Test record cleanup: ${cleanupConfirmed ? 'confirmed' : writeAcknowledged ? 'NOT CONFIRMED' : 'not needed'}`);
    return;
  }

  console.log('MongoDB verification successful.');
  console.log(`Target database: ${DATABASE}`);
  console.log('Environment: MONGODB_URI loaded by the Next.js environment loader; value withheld.');
  console.log('Ping: successful.');
  console.log(`Temporary collection: ${COLLECTION}.`);
  console.log('Temporary write: acknowledged.');
  console.log('Temporary read: matched the inserted test record.');
  console.log(`Test record cleanup: ${cleanupConfirmed ? 'confirmed' : 'NOT CONFIRMED'}.`);
  if (!cleanupConfirmed) process.exitCode = 1;
}

void main().catch(() => {
  console.error('MongoDB verification failed unexpectedly; diagnostic details are withheld to protect connection credentials.');
  process.exitCode = 1;
});
