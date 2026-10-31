import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditLog, Category, Product } from '@/lib/models';
import { sameOrigin, tooLarge } from '@/lib/security';

function credentials() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return cloud && key && secret ? { cloud, key, secret } : null;
}

export async function GET(req: NextRequest) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = credentials();
  if (!config) return NextResponse.json({ error: 'Media library is not configured. Add Cloudinary credentials to the server environment.' }, { status: 503 });
  try {
    const cursor = req.nextUrl.searchParams.get('cursor');
    const params = new URLSearchParams({ prefix: 'hanumanji-agro/', max_results: '100' });
    if (cursor) params.set('next_cursor', cursor);
    const result = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud)}/resources/image/upload?${params}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString('base64')}` },
      cache: 'no-store',
    });
    if (!result.ok) return NextResponse.json({ error: 'Cloudinary could not load the media library.' }, { status: 502 });
    const data = await result.json();
    return NextResponse.json({ resources: data.resources || [], nextCursor: data.next_cursor || null });
  } catch {
    return NextResponse.json({ error: 'Unable to load the media library.' }, { status: 503 });
  }
}

const deleteSchema = z.object({ publicId: z.string().trim().min(1).max(255).regex(/^hanumanji-agro\/[a-zA-Z0-9/_-]+$/) });
export async function DELETE(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const large = tooLarge(req, 4 * 1024);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const config = credentials();
  if (!config) return NextResponse.json({ error: 'Cloudinary is not configured.' }, { status: 503 });
  try {
    const parsed = deleteSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid media identifier.' }, { status: 400 });
    const publicId = parsed.data.publicId;
    await db();
    const escaped = publicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const referenced = await Promise.all([
      Product.exists({ $or: [{ image: { $regex: escaped } }, { images: { $regex: escaped } }] }),
      Category.exists({ image: { $regex: escaped } }),
    ]);
    if (referenced.some(Boolean)) return NextResponse.json({ error: 'This image is in use. Replace it in its product or category first.' }, { status: 409 });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${config.secret}`).digest('hex');
    const form = new FormData();
    form.set('public_id', publicId);
    form.set('timestamp', String(timestamp));
    form.set('api_key', config.key);
    form.set('signature', signature);
    const result = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud)}/image/destroy`, { method: 'POST', body: form });
    const data = await result.json();
    if (!result.ok || data.result !== 'ok' && data.result !== 'not found') return NextResponse.json({ error: 'Cloudinary could not delete this image.' }, { status: 502 });
    await AuditLog.create({ actor: admin._id, action: 'media.delete', entity: 'Cloudinary', entityId: publicId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to delete media.' }, { status: 503 });
  }
}
