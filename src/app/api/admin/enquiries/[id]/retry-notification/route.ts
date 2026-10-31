import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { enquiryOwnerEmail, sendEmail } from '@/lib/email';
import { Enquiry, SiteSettings } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const large = tooLarge(req, 2 * 1024);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ error: 'Email delivery is not configured.' }, { status: 503 });
  try {
    await db();
    const { id } = await params;
    const enquiry: any = await Enquiry.findById(id);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    if (enquiry.notificationStatus === 'sent') return NextResponse.json({ sent: true, duplicate: true });
    const settings: any = await SiteSettings.findOne({ key: 'main' }).select('notificationEmail notificationPreferences').lean();
    if (settings?.notificationPreferences?.ownerEmail === false) return NextResponse.json({ error: 'Owner email notifications are disabled in settings.' }, { status: 409 });
    const to = process.env.OWNER_NOTIFICATION_EMAIL || settings?.notificationEmail;
    if (!to) return NextResponse.json({ error: 'Owner notification email is not configured.' }, { status: 503 });
    const delivery = await sendEmail({
      to,
      subject: `New enquiry ${enquiry.reference} · Hanumanji Agro`,
      html: enquiryOwnerEmail({
        reference: enquiry.reference,
        type: enquiry.enquiryType,
        name: enquiry.customerSnapshot?.name,
        phone: enquiry.customerSnapshot?.phone,
        email: enquiry.customerSnapshot?.email,
        company: enquiry.customerSnapshot?.company,
        subject: enquiry.subject,
        message: enquiry.message,
        location: [enquiry.destination?.city, enquiry.destination?.state].filter(Boolean).join(', '),
        products: (enquiry.items || []).map((item: any) => ({
          name: item.snapshot?.name || 'Product',
          quantity: item.quantity,
          unit: item.unit,
          grade: item.snapshot?.grade,
        })),
      }),
      idempotencyKey: `enquiry-owner/${enquiry.reference}`,
    });
    enquiry.notificationStatus = delivery.status;
    if (delivery.id) enquiry.notificationId = delivery.id;
    await enquiry.save();
    await audit(admin._id, 'notification.enquiry_retry', 'Enquiry', id, {
      provider: 'Resend',
      status: delivery.status,
      ...(delivery.id ? { providerMessageId: delivery.id } : {}),
      ...(delivery.errorCode ? { errorCode: delivery.errorCode } : {}),
      ...(delivery.httpStatus ? { httpStatus: delivery.httpStatus } : {}),
    });
    return NextResponse.json({ status: delivery.status });
  } catch {
    return NextResponse.json({ error: 'Unable to retry the owner notification.' }, { status: 503 });
  }
}
