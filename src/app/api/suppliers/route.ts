import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sendEmail, supplierOwnerEmail } from '@/lib/email';
import { SiteSettings, SupplierEnquiry } from '@/lib/models';
import { rateLimit, sameOrigin, tooLarge } from '@/lib/security';

export const runtime = 'nodejs';

const emailSchema = z.union([z.string().trim().email().max(254).transform((email) => email.toLowerCase()), z.literal('')]).optional();
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[\d\s().-]+$/).transform((phone) => phone.replace(/\D/g, '')).refine((phone) => phone.length >= 7 && phone.length <= 15),
  email: emailSchema,
  product: z.string().trim().min(2).max(160),
  location: z.string().trim().min(2).max(160),
  quantity: z.string().trim().max(100).optional(),
  period: z.string().trim().max(100).optional(),
  description: z.string().trim().max(3000).optional(),
});
const keySchema = z.string().uuid();

export async function POST(req: NextRequest) {
  const large = tooLarge(req, 32 * 1024);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const key = keySchema.safeParse(req.headers.get('idempotency-key'));
  if (!key.success) return NextResponse.json({ error: 'A valid submission key is required. Please retry the form.' }, { status: 400 });

  try {
    const limit = await rateLimit(req, 'public-supplier', 8);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Please check the supplier enquiry and try again.' }, { status: 400 });
    await db();
    await SupplierEnquiry.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    const prior: any = await SupplierEnquiry.findOne({ idempotencyKey: key.data }).select('notificationStatus').lean();
    if (prior) return NextResponse.json({ received: true, notificationStatus: prior.notificationStatus, duplicate: true }, { status: 200 });

    let submission;
    try {
      submission = await SupplierEnquiry.create({ ...parsed.data, idempotencyKey: key.data });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        const priorSubmission: any = await SupplierEnquiry.findOne({ idempotencyKey: key.data }).select('notificationStatus').lean();
        if (priorSubmission) return NextResponse.json({ received: true, notificationStatus: priorSubmission.notificationStatus, duplicate: true }, { status: 200 });
      }
      throw error;
    }

    const settings = await SiteSettings.findOne({ key: 'main' }).select('notificationEmail notificationPreferences').lean() as any;
    const preferences = settings?.notificationPreferences || { ownerEmail: true };
    const to = process.env.OWNER_NOTIFICATION_EMAIL || settings?.notificationEmail;
    let notificationStatus: 'pending' | 'sent' | 'failed' | 'disabled' = preferences.ownerEmail === false ? 'disabled' : 'pending';
    let notificationId: string | undefined;
    if (preferences.ownerEmail !== false && to && process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.DISABLE_EXTERNAL_NOTIFICATIONS !== '1') {
      const delivery = await sendEmail({
        to,
        subject: 'New farmer and supplier enquiry · Hanumanji Agro',
        html: supplierOwnerEmail({ id: String(submission._id), ...parsed.data }),
        idempotencyKey: `supplier-owner/${submission._id}`,
      });
      notificationStatus = delivery.status;
      notificationId = delivery.id;
    }
    await SupplierEnquiry.updateOne({ _id: submission._id }, { $set: { notificationStatus, ...(notificationId ? { notificationId } : {}) } });
    return NextResponse.json({ received: true, notificationStatus }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save the supplier enquiry right now.' }, { status: 503 });
  }
}
