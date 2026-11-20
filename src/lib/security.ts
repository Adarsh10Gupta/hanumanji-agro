import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { AuditLog, RateLimit } from './models';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;

export type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; response: NextResponse };

export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse };

export function trustedClientIp(req: NextRequest) {
  const header = (process.env.TRUSTED_CLIENT_IP_HEADER || 'x-real-ip').trim().toLowerCase();
  if (!HEADER_NAME.test(header)) return null;
  const value = req.headers.get(header)?.trim();
  return value && !value.includes(',') && isIP(value) ? value : null;
}

export async function rateLimit(req: NextRequest, scope: string, maximum: number, windowMs = 15 * 60_000) {
  const clientIp = trustedClientIp(req);
  if (!clientIp) throw new Error('Trusted client IP is unavailable; verify the reverse-proxy configuration.');
  await db();
  const bucket = Math.floor(Date.now() / windowMs);
  const key = digest(`${scope}:${clientIp}:${bucket}`);
  const row = await RateLimit.findOneAndUpdate({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } }, { upsert: true, new: true });
  return { allowed: row.count <= maximum, retryAfter: Math.max(1, Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)) };
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try { return new URL(origin).origin === req.nextUrl.origin; } catch { return false; }
}
export function tooLarge(req: NextRequest, maxBytes = 64 * 1024) {
  const value = req.headers.get('content-length');
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return NextResponse.json({ error: 'Invalid request size.' }, { status: 400 });
  return Number(value) > maxBytes ? NextResponse.json({ error: 'Request is too large.' }, { status: 413 }) : null;
}

export async function readBoundedBody(req: NextRequest, maxBytes = 64 * 1024): Promise<BoundedBodyResult> {
  const declared = tooLarge(req, maxBytes);
  if (declared) return { ok: false, response: declared };

  const reader = req.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array() };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: NextResponse.json({ error: 'Request is too large.' }, { status: 413 }) };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unable to read request body.' }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function readJsonBody(req: NextRequest, maxBytes = 64 * 1024): Promise<JsonBodyResult> {
  const body = await readBoundedBody(req, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) };
  }
}

export async function readFormDataBody(req: NextRequest, maxBytes: number) {
  const body = await readBoundedBody(req, maxBytes);
  if (!body.ok) return body;
  try {
    const buffer = new ArrayBuffer(body.bytes.byteLength);
    new Uint8Array(buffer).set(body.bytes);
    const form = await new Response(buffer, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
    return { ok: true as const, form };
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: 'Invalid form data.' }, { status: 400 }) };
  }
}

export async function audit(actor: unknown, action: string, entity: string, entityId: string, metadata?: Record<string, unknown>) {
  await AuditLog.create({ actor, action, entity, entityId, metadata });
}
