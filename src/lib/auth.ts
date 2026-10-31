import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { Admin, Session } from './models';

const COOKIE = 'ha_session';
const SESSION_SECONDS = 12 * 60 * 60;

function tokenHash(token: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.');
  return createHmac('sha256', secret).update(token).digest('hex');
}

export async function createSession(adminId: string) {
  await db();
  const token = randomBytes(32).toString('base64url');
  await Session.create({ tokenHash: tokenHash(token), admin: adminId, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function currentSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let hash: string;
  try { hash = tokenHash(token); } catch { return null; }
  await db();
  const session = await Session.findOne({ tokenHash: hash, expiresAt: { $gt: new Date() } }).populate('admin');
  const admin = session?.admin as any;
  if (!admin || !admin.active || admin.ownerKey !== 'primary') return null;
  return { session, admin };
}

export async function owner() {
  return (await currentSession())?.admin ?? null;
}

export async function revokeOtherSessions(adminId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  await db();
  if (!token) return 0;
  const result = await Session.deleteMany({ admin: adminId, tokenHash: { $ne: tokenHash(token) } });
  return result.deletedCount || 0;
}

export async function revokeAllSessions(adminId: string) {
  await db();
  const result = await Session.deleteMany({ admin: adminId });
  return result.deletedCount || 0;
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token) {
    try {
      await db();
      await Session.deleteOne({ tokenHash: tokenHash(token) });
    } catch {
      // Clearing the client cookie still ends access when the database is unavailable.
    }
  }
  cookieStore.delete(COOKIE);
}
