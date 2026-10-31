import { NextRequest, NextResponse } from 'next/server';
import { endSession, owner } from '@/lib/auth';
import { AuditLog } from '@/lib/models';
import { sameOrigin } from '@/lib/security';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const admin = await owner();
    await endSession();
    if (admin) await AuditLog.create({ actor: admin._id, action: 'auth.logout', entity: 'Admin', entityId: String(admin._id) });
    return NextResponse.json({ ok: true });
  } catch {
    await endSession();
    return NextResponse.json({ ok: true });
  }
}
