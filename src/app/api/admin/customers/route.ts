import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Customer, Enquiry } from '@/lib/models';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(req: NextRequest) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const params = req.nextUrl.searchParams;
    const search = escapeRegex((params.get('search') || '').trim().slice(0, 80));
    const type = params.get('type');
    const requestedPage = Number(params.get('page') || 1);
    const requestedLimit = Number(params.get('limit') || 20);
    if (!Number.isFinite(requestedPage) || !Number.isFinite(requestedLimit)) return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
    const page = Math.max(1, Math.floor(requestedPage));
    const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
    const query: Record<string, unknown> = {};
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }, { company: { $regex: search, $options: 'i' } }];
    if (type && type !== 'All') query.type = type;
    const [total, rows] = await Promise.all([Customer.countDocuments(query), Customer.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean()]);
    const ids = rows.map((row) => row._id);
    const counts = await Enquiry.aggregate([{ $match: { customer: { $in: ids } } }, { $group: { _id: '$customer', count: { $sum: 1 }, last: { $max: '$createdAt' } } }]);
    const byCustomer = new Map(counts.map((row) => [String(row._id), row]));
    return NextResponse.json({ rows: rows.map((customer) => ({ ...customer, enquiryCount: byCustomer.get(String(customer._id))?.count || 0, lastEnquiryAt: byCustomer.get(String(customer._id))?.last || null })), total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: 'Unable to load customers.' }, { status: 503 });
  }
}
