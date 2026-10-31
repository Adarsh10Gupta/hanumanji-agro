import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import argon2 from 'argon2';
import { db } from '@/lib/db';
import { Admin, AuditLog } from '@/lib/models';
import { createSession } from '@/lib/auth';
import { rateLimit, sameOrigin, tooLarge } from '@/lib/security';

// Bootstrap trims and lowercases owner emails; normalize the submitted email the same way.
const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) });
export async function POST(req: NextRequest) {
  const tooBig = tooLarge(req, 8 * 1024); if (tooBig) return tooBig;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const limit = await rateLimit(req, 'admin-login', 5); if (!limit.allowed) return NextResponse.json({ error: 'Unable to sign in. Try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
    const parsed = schema.safeParse(await req.json()); if (!parsed.success) return NextResponse.json({ error: 'Unable to sign in.' }, { status: 401 });
    await db(); const admin = await Admin.findOne({ email: parsed.data.email.toLowerCase(), ownerKey: 'primary', active: true }).select('+passwordHash');
    if (!admin || !await argon2.verify(admin.passwordHash, parsed.data.password)) {
      await AuditLog.create({ action: 'auth.failure', entity: 'Admin', entityId: 'owner-login' });
      return NextResponse.json({ error: 'Unable to sign in.' }, { status: 401 });
    }
    await createSession(String(admin._id));
    await AuditLog.create({ actor: admin._id, action: 'auth.login', entity: 'Admin', entityId: String(admin._id) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Unable to sign in.' }, { status: 503 }); }
}
