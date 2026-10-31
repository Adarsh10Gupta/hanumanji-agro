import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SiteSettings } from '@/lib/models';
import { DEFAULT_BUSINESS_WHATSAPP } from '@/lib/whatsapp-number';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db();
    const settings = await SiteSettings.findOne({ key: 'main' }).select('businessName location email phone whatsapp social description logo').lean() as any;
    return NextResponse.json({
      businessName: settings?.businessName || 'Hanumanji Agro',
      location: settings?.location || 'Kalimpong, Northeast India',
      email: settings?.email || 'hanumanjiagro@gmail.com',
      phone: settings?.phone || '+91 7001102168',
      whatsapp: settings?.whatsapp || DEFAULT_BUSINESS_WHATSAPP,
      social: { facebook: settings?.social?.facebook || '', instagram: settings?.social?.instagram || '' },
      description: settings?.description || '',
      logo: settings?.logo || '',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Business settings are temporarily unavailable.' }, { status: 503 });
  }
}
