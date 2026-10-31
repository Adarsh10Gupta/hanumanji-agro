import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { SiteSettings } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';
import { DEFAULT_BUSINESS_WHATSAPP, formatWhatsAppNumber } from '@/lib/whatsapp-number';

const schema = z.object({
  businessName: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(7).max(30),
  whatsapp: z.string().trim().min(7).max(30).refine((value) => formatWhatsAppNumber(value) !== null).optional(),
  notificationEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  notificationPreferences: z.object({ ownerEmail: z.boolean(), customerAcknowledgement: z.boolean(), orderStatus: z.boolean() }),
  social: z.object({ facebook: z.string().url().or(z.literal('')), instagram: z.string().url().or(z.literal('')) }),
  description: z.string().max(2000),
  logo: z.string().url().optional().or(z.literal('')),
});
const whatsappSchema = z.object({
  whatsapp: z.string().trim().min(7).max(30).transform((value, ctx) => {
    const formatted = formatWhatsAppNumber(value);
    if (!formatted) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid international phone number.' });
      return z.NEVER;
    }
    return formatted;
  }),
});

export async function GET() {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await db();
    const settings = await SiteSettings.findOneAndUpdate(
      { key: 'main' },
      { $setOnInsert: { key: 'main' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean() as any;
    if (!String(settings.whatsapp || '').trim()) {
      await SiteSettings.updateOne(
        { key: 'main', $or: [{ whatsapp: { $exists: false } }, { whatsapp: null }, { whatsapp: '' }, { whatsapp: /^\s*$/ }] },
        { $set: { whatsapp: DEFAULT_BUSINESS_WHATSAPP } },
      );
    }
    return NextResponse.json({
      businessName: settings?.businessName || 'Hanumanji Agro',
      location: settings?.location || 'Kalimpong, Northeast India',
      email: settings?.email || 'hanumanjiagro@gmail.com',
      phone: settings?.phone || '+91 7001102168',
      whatsapp: settings?.whatsapp || DEFAULT_BUSINESS_WHATSAPP,
      notificationEmail: settings?.notificationEmail || 'hanumanjiagro@gmail.com',
      notificationPreferences: settings?.notificationPreferences || { ownerEmail: true, customerAcknowledgement: false, orderStatus: false },
      social: settings?.social || { facebook: '', instagram: '' },
      description: settings?.description || '',
      logo: settings?.logo || '',
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load settings.' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const large = tooLarge(req);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const { whatsapp } = whatsappSchema.parse(await req.json());
    await db();
    await SiteSettings.findOneAndUpdate(
      { key: 'main' },
      { $set: { whatsapp }, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await audit(admin._id, 'settings.update', 'SiteSettings', 'main', { field: 'whatsapp' });
    for (const path of ['/', '/contact', '/business-enquiries', '/farmers', '/products']) revalidatePath(path);
    return NextResponse.json({ whatsapp });
  } catch {
    return NextResponse.json({ error: 'WhatsApp number is invalid or could not be saved.' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const large = tooLarge(req);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  try {
    const data = schema.parse(await req.json());
    await db();
    const { whatsapp, ...otherSettings } = data;
    const settings = await SiteSettings.findOneAndUpdate(
      { key: 'main' },
      { $set: { ...otherSettings, ...(whatsapp ? { whatsapp } : {}) }, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    await audit(admin._id, 'settings.update', 'SiteSettings', 'main');
    for (const path of ['/', '/contact', '/business-enquiries', '/farmers']) revalidatePath(path);
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: 'Settings are invalid or could not be saved.' }, { status: 400 });
  }
}
