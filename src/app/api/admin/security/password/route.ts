import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import argon2 from 'argon2';
import { endSession, owner, revokeAllSessions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Admin, AuditLog } from '@/lib/models';
import { rateLimit, sameOrigin, tooLarge } from '@/lib/security';

const schema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(16).max(256) });

export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const size = tooLarge(req, 8 * 1024);
  if (size) return size;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const limit = await rateLimit(req, 'admin-password-change', 5);
    if (!limit.allowed) return NextResponse.json({ error: 'Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Use a new password with at least 16 characters.' }, { status: 400 });
    await db();
    const account = await Admin.findById(admin._id).select('+passwordHash');
    if (!account || !await argon2.verify(account.passwordHash, parsed.data.currentPassword)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
    account.passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    await account.save();
    await revokeAllSessions(String(admin._id));
    await AuditLog.create({ actor: admin._id, action: 'security.password-changed', entity: 'Admin', entityId: String(admin._id) });
    await endSession();
    return NextResponse.json({ ok: true, reauthenticationRequired: true });
  } catch {
    return NextResponse.json({ error: 'Unable to update the password.' }, { status: 503 });
  }
}
