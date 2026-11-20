import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Customer, Enquiry } from '@/lib/models';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const requestedPage = Number(req.nextUrl.searchParams.get('page') || 1);
    const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 20);
    if (!Number.isFinite(requestedPage) || !Number.isFinite(requestedLimit)) {
      return NextResponse.json({ error: 'Invalid pagination.' }, { status: 400 });
    }
    const page = Math.max(1, Math.floor(requestedPage));
    const limit = Math.min(100, Math.max(1, Math.floor(requestedLimit)));
    await db();
    const [customer, total, enquiries] = await Promise.all([
      Customer.findById(id).select('name phone email company type').lean(),
      Enquiry.countDocuments({ customer: id }),
      Enquiry.find({ customer: id })
        .select('reference enquiryType status createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    return NextResponse.json({ customer, enquiries, total, page, pages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: 'Unable to load customer history.' }, { status: 503 });
  }
}
