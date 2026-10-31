import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { SupplierEnquiry } from '@/lib/models';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(req: NextRequest) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const params = req.nextUrl.searchParams;
    const search = escapeRegex((params.get('search') || '').trim().slice(0, 80));
    const status = params.get('status');
    const requestedPage = Number(params.get('page') || 1);
    const requestedLimit = Number(params.get('limit') || 20);
    if (!Number.isFinite(requestedPage) || !Number.isFinite(requestedLimit)) return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
    const page = Math.max(1, Math.floor(requestedPage));
    const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
    const query: Record<string, unknown> = {};
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { product: { $regex: search, $options: 'i' } }, { location: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }];
    if (status && status !== 'All') query.status = status;
    const [total, rows] = await Promise.all([SupplierEnquiry.countDocuments(query), SupplierEnquiry.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()]);
    return NextResponse.json({ rows, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: 'Unable to load supplier enquiries.' }, { status: 503 });
  }
}
