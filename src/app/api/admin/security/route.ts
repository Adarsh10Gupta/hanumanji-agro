import { NextRequest, NextResponse } from 'next/server';
import { currentSession, owner, revokeOtherSessions } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditLog, Session } from '@/lib/models';
import { sameOrigin } from '@/lib/security';

export async function GET() {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const current = await currentSession();
    if (!current) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
    const [activeSessions, events] = await Promise.all([
      Session.countDocuments({ admin: admin._id, expiresAt: { $gt: new Date() } }),
      AuditLog.find({ actor: admin._id, action: /^(auth\.|security\.)/ }).sort({ at: -1 }).limit(20).select('action at').lean(),
    ]);
    return NextResponse.json({
      session: { createdAt: current.session.createdAt, expiresAt: current.session.expiresAt },
      activeSessions,
      events: events.map((event: any) => ({ action: event.action, at: event.at })),
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load security information.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const result = await revokeOtherSessions(String(admin._id));
    await AuditLog.create({ actor: admin._id, action: 'security.sessions-revoked', entity: 'Session', entityId: String(admin._id), metadata: { revokedCount: result } });
    return NextResponse.json({ revoked: result });
  } catch {
    return NextResponse.json({ error: 'Unable to revoke other sessions.' }, { status: 503 });
  }
}
