import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function GET(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== '1' || process.env.NODE_ENV === 'production' || process.env.VERCEL
    || /prod(?:uction)?|live/i.test(process.env.VERCEL_ENV || '')) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const expectedToken = process.env.E2E_TEST_TOKEN || '';
  const suppliedToken = req.headers.get('x-e2e-test-token') || '';
  const expectedBytes = Buffer.from(expectedToken);
  const suppliedBytes = Buffer.from(suppliedToken);
  if (expectedBytes.length < 32 || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const databaseName = process.env.E2E_TEST_DATABASE_NAME?.trim();
  const uri = process.env.MONGODB_URI;
  if (!databaseName
    || process.env.MONGODB_DATABASE_NAME !== databaseName
    || process.env.DISABLE_EXTERNAL_NOTIFICATIONS !== '1'
    || process.env.E2E_DISABLE_WHATSAPP !== '1'
    || !uri) {
    return NextResponse.json({ error: 'Unsafe E2E server configuration.' }, { status: 503 });
  }

  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    return NextResponse.json({ error: 'Unsafe E2E database URI.' }, { status: 503 });
  }
  let uriDatabaseName: string;
  try {
    uriDatabaseName = decodeURIComponent(parsedUri.pathname.replace(/^\/+/, ''));
  } catch {
    return NextResponse.json({ error: 'Unsafe E2E database URI path.' }, { status: 503 });
  }
  if (parsedUri.protocol !== 'mongodb:'
    || !localHosts.has(parsedUri.hostname)
    || uriDatabaseName !== databaseName) {
    return NextResponse.json({ error: 'Unsafe E2E database target.' }, { status: 503 });
  }

  try {
    await db();
    const connection = (await import('mongoose')).default.connection;
    const connectedDatabaseName = connection.db?.databaseName;
    if (connectedDatabaseName !== databaseName || !localHosts.has(connection.host)) {
      return NextResponse.json({ error: 'Database target mismatch.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, databaseName });
  } catch {
    return NextResponse.json({ error: 'Test database is unavailable.' }, { status: 503 });
  }
}
