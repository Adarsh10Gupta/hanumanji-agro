import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { AuditLog, RateLimit } from './models';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function rateLimit(req: NextRequest, scope: string, maximum: number, windowMs = 15 * 60_000) {
  await db();
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const bucket = Math.floor(Date.now() / windowMs);
  const key = digest(`${scope}:${forwarded}:${bucket}`);
  const row = await RateLimit.findOneAndUpdate({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } }, { upsert: true, new: true });
  return { allowed: row.count <= maximum, retryAfter: Math.max(1, Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)) };
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try { return new URL(origin).origin === req.nextUrl.origin; } catch { return false; }
}
export function tooLarge(req: NextRequest, maxBytes = 64 * 1024) {
  const size = Number(req.headers.get('content-length') || 0);
  return size > maxBytes ? NextResponse.json({ error: 'Request is too large.' }, { status: 413 }) : null;
}
export async function audit(actor: unknown, action: string, entity: string, entityId: string, metadata?: Record<string, unknown>) {
  await AuditLog.create({ actor, action, entity, entityId, metadata });
}
