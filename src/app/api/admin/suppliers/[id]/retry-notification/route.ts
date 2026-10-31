import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendEmail, supplierOwnerEmail } from '@/lib/email';
import { AuditLog, SiteSettings, SupplierEnquiry } from '@/lib/models';
import { sameOrigin, tooLarge } from '@/lib/security';

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
    const submission: any = await SupplierEnquiry.findById(id);
    if (!submission) return NextResponse.json({ error: 'Supplier submission not found.' }, { status: 404 });
    if (submission.notificationStatus === 'sent') return NextResponse.json({ sent: true, duplicate: true });
    const settings: any = await SiteSettings.findOne({ key: 'main' }).select('notificationEmail notificationPreferences').lean();
    if (settings?.notificationPreferences?.ownerEmail === false) return NextResponse.json({ error: 'Owner email notifications are disabled in settings.' }, { status: 409 });
    const to = process.env.OWNER_NOTIFICATION_EMAIL || settings?.notificationEmail;
    if (!to) return NextResponse.json({ error: 'Owner notification email is not configured.' }, { status: 503 });
    const delivery = await sendEmail({
      to,
      subject: 'New farmer and supplier enquiry · Hanumanji Agro',
      html: supplierOwnerEmail({ id, name: submission.name, phone: submission.phone, email: submission.email, product: submission.product, location: submission.location, quantity: submission.quantity, period: submission.period, description: submission.description }),
      idempotencyKey: `supplier-owner/${id}`,
    });
    submission.notificationStatus = delivery.status;
    if (delivery.id) submission.notificationId = delivery.id;
    await submission.save();
    await AuditLog.create({ actor: admin._id, action: 'notification.supplier_retry', entity: 'SupplierEnquiry', entityId: id, metadata: { status: delivery.status } });
    return NextResponse.json({ status: delivery.status });
  } catch {
    return NextResponse.json({ error: 'Unable to retry the supplier notification.' }, { status: 503 });
  }
}
