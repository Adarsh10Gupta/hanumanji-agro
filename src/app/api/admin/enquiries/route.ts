import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Enquiry } from '@/lib/models';

export const runtime = 'nodejs';
const statuses = ['New', 'Contacted', 'Quotation Sent', 'Accepted', 'Processing', 'Dispatched', 'Completed', 'Rejected', 'Cancelled'];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const csvCell = (value: unknown) => {
  const raw = String(value ?? '').replace(/[\r\n]+/g, ' ');
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};
const parseDate = (value: string | null) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export async function GET(req: NextRequest) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const params = req.nextUrl.searchParams;
    const search = escapeRegex((params.get('search') || '').trim().slice(0, 100));
    const status = params.get('status') || 'All';
    const from = parseDate(params.get('from'));
    const to = parseDate(params.get('to'));
    if (from === undefined || to === undefined) return NextResponse.json({ error: 'Date filters must use YYYY-MM-DD.' }, { status: 400 });
    if (status !== 'All' && !statuses.includes(status)) return NextResponse.json({ error: 'Invalid status filter.' }, { status: 400 });
    const requestedPage = Number(params.get('page') || 1);
    const requestedLimit = Number(params.get('limit') || 20);
    if (!Number.isFinite(requestedPage) || !Number.isFinite(requestedLimit)) return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
    const page = Math.max(1, Math.floor(requestedPage));
    const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
    const query: Record<string, any> = {};
    if (status !== 'All') query.status = status;
    if (search) query.$or = [
      { reference: { $regex: search, $options: 'i' } },
      { 'customerSnapshot.name': { $regex: search, $options: 'i' } },
      { 'customerSnapshot.phone': { $regex: search, $options: 'i' } },
    ];
    if (from || to) query.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } : {}) };

    const total = await Enquiry.countDocuments(query);
    if (params.get('format') === 'csv') {
      if (total > 5000) return NextResponse.json({ error: 'Refine your filters to export no more than 5,000 enquiries at once.' }, { status: 413 });
      const rows = await Enquiry.find(query).sort({ createdAt: -1 }).limit(5000).lean();
      const header = ['Reference', 'Name', 'Phone', 'Email', 'Type', 'Subject', 'Products', 'Destination', 'Status', 'Created'];
      const lines = rows.map((enquiry: any) => [
        enquiry.reference, enquiry.customerSnapshot?.name, enquiry.customerSnapshot?.phone, enquiry.customerSnapshot?.email, enquiry.enquiryType,
        enquiry.subject, enquiry.items?.map((item: any) => `${item.snapshot?.name || 'Product'} ${item.quantity} ${item.unit || ''}`).join('; '),
        [enquiry.destination?.city, enquiry.destination?.state].filter(Boolean).join(', '), enquiry.status, enquiry.createdAt,
      ].map(csvCell).join(','));
      return new NextResponse([header.map(csvCell).join(','), ...lines].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="enquiries.csv"', 'Cache-Control': 'no-store' } });
    }
    const rows = await Enquiry.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ rows, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: 'Unable to load enquiries.' }, { status: 503 });
  }
}
