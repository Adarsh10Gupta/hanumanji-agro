import { loadEnvConfig } from '@next/env';
import argon2 from 'argon2';
import { Admin, Session } from '../src/lib/models.js';
import { db } from '../src/lib/db.js';

loadEnvConfig(process.cwd());

const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
let cookie = '';
let loginSucceeded = false;

async function run() {
  if (!email || !password) {
    console.log('Diagnostic unavailable: owner email/password environment variables are missing.');
    process.exitCode = 2;
    return;
  }

  await db();
  const databaseName = (await import('mongoose')).default.connection.db?.databaseName;
  if (databaseName !== 'hanumanji_agro') throw new Error('Database target check failed.');

  const admins = await Admin.find({ ownerKey: 'primary' }).select('+passwordHash').limit(2).lean();
  const admin = admins[0];
  const emailMatches = !!admin && admin.email === email;
  const hashExists = !!admin?.passwordHash;
  const passwordEncodingRoundTrips = Buffer.from(password, 'utf8').toString('utf8') === password;
  const passwordHasEdgeWhitespace = password.trim() !== password;
  const passwordMatches = !!admin?.passwordHash && await argon2.verify(admin.passwordHash, password);

  console.log(`Database target: ${databaseName}`);
  console.log(`Primary owner record count: ${admins.length === 2 ? 'more than one (unexpected)' : admins.length}`);
  console.log(`Owner email: ${admin?.email ?? 'missing'}`);
  console.log(`Configured email matches owner: ${emailMatches}`);
  console.log(`Primary owner key: ${admin?.ownerKey === 'primary' ? 'verified' : 'missing or incorrect'}`);
  console.log(`Password hash exists: ${hashExists}`);
  console.log(`Argon2id credential verification: ${passwordMatches ? 'passed' : 'failed'}`);
  console.log(`Password UTF-8 round trip: ${passwordEncodingRoundTrips ? 'passed' : 'failed'}`);
  console.log(`Password has leading/trailing whitespace: ${passwordHasEdgeWhitespace ? 'yes' : 'no'}`);

  const beforeSessions = admin ? await Session.countDocuments({ admin: admin._id, expiresAt: { $gt: new Date() } }) : 0;
  try {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      // Exercise the login boundary with surrounding whitespace and mixed case.
      body: JSON.stringify({ email: ` ${email.toUpperCase()} `, password }),
    });
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
    const sessionCookie = setCookies.find((value) => value.startsWith('ha_session=')) ?? '';
    cookie = sessionCookie.split(';', 1)[0];
    loginSucceeded = response.ok && !!cookie;
    console.log(`Login API status: HTTP ${response.status}`);
    console.log(`Session cookie issued: ${!!cookie}`);
    console.log(`Cookie flags: HttpOnly=${/;\s*httponly/i.test(sessionCookie)}, PathRoot=${/;\s*path=\//i.test(sessionCookie)}, SameSiteStrict=${/;\s*samesite=strict/i.test(sessionCookie)}, SecureRequiredInProduction=${process.env.NODE_ENV === 'production' ? /;\s*secure/i.test(sessionCookie) : 'not required in development'}`);

    if (loginSucceeded) {
      const authResponse = await fetch(`${baseUrl}/api/admin/security`, { headers: { cookie } });
      let activeSessions = false;
      if (authResponse.ok) {
        const payload = await authResponse.json() as { activeSessions?: number; session?: { expiresAt?: string } };
        activeSessions = typeof payload.activeSessions === 'number' && payload.activeSessions > beforeSessions && !!payload.session?.expiresAt && Date.parse(payload.session.expiresAt) > Date.now();
      }
      console.log(`Authenticated admin endpoint: HTTP ${authResponse.status}`);
      console.log(`Session persisted and unexpired: ${activeSessions ? 'verified' : 'failed'}`);
      if (!authResponse.ok || !activeSessions) process.exitCode = 1;
    }

    if (!loginSucceeded) process.exitCode = 1;
  } finally {
    if (cookie) {
      await fetch(`${baseUrl}/api/admin/logout`, { method: 'POST', headers: { origin: baseUrl, cookie } }).catch(() => undefined);
      const remaining = await Session.countDocuments({ admin: admin?._id, expiresAt: { $gt: new Date() } });
      console.log(`Diagnostic session cleaned up: ${remaining <= beforeSessions ? 'yes' : 'no'}`);
      if (remaining > beforeSessions) process.exitCode = 1;
    }
  }
}

void run().catch(() => {
  console.error('Login diagnostic failed; sensitive details are withheld.');
  process.exitCode = 1;
}).finally(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect().catch(() => undefined);
});
