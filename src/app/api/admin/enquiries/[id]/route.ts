import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { statusUpdateEmail } from '@/lib/email';
import { enqueueEmailNotification } from '@/lib/email-outbox';
import { Enquiry, SiteSettings } from '@/lib/models';
import { audit, readJsonBody, sameOrigin } from '@/lib/security';
import { randomUUID } from 'node:crypto';
import { enqueueOrderStatusNotification, orderStatusNotificationAllowed } from '@/lib/order-status-notifications';

const statuses = ['New', 'Contacted', 'Quotation Sent', 'Accepted', 'Processing', 'Dispatched', 'Completed', 'Rejected', 'Cancelled'] as const;
const quotationSchema = z.object({
  lines: z.array(z.object({ productName: z.string().trim().max(160), quantity: z.number().positive().max(1e9), unit: z.string().max(24), unitPrice: z.number().min(0).max(1e12) })).max(30),
  transport: z.number().min(0).max(1e12), additionalCharges: z.number().min(0).max(1e12),
  notes: z.string().max(2000).optional(), terms: z.string().max(3000).optional(), validUntil: z.string().datetime().optional(),
});
const updateSchema = z.object({ status: z.enum(statuses).optional(), notes: z.string().max(6000).optional(), quotation: quotationSchema.optional() });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await db();
    const enquiry = await Enquiry.findById(id).lean();
    return enquiry ? NextResponse.json(enquiry) : NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Unable to load enquiry.' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  try {
    const data = updateSchema.parse(body.data);
    const { id } = await params;
    await db();
    const enquiry: any = await Enquiry.findById(id);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    const previousStatus = enquiry.status;
    let statusChanged = !!data.status && data.status !== previousStatus;

    if (data.notes !== undefined) enquiry.notes = data.notes;
    if (data.quotation) {
      const total = data.quotation.lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) + data.quotation.transport + data.quotation.additionalCharges;
      if (!Number.isFinite(total)) return NextResponse.json({ error: 'Quotation total is invalid.' }, { status: 400 });
      const nextQuotation = { ...data.quotation, total, validUntil: data.quotation.validUntil ? new Date(data.quotation.validUntil) : undefined };
      if (enquiry.quotation?.lines?.length) {
        const previous = enquiry.quotation.toObject?.() || enquiry.quotation;
        const comparablePrevious = { ...previous, sentAt: undefined, emailId: undefined };
        if (JSON.stringify(comparablePrevious) !== JSON.stringify({ ...nextQuotation, sentAt: undefined, emailId: undefined })) {
          enquiry.quotationHistory.push({ ...previous, savedAt: new Date(), actor: admin._id });
        }
      }
      enquiry.quotation = nextQuotation;
    }
    await enquiry.save();
    if (statusChanged && data.status) {
      const transitioned = await Enquiry.updateOne(
        { _id: id, status: previousStatus },
        { $set: { status: data.status }, $push: { statusHistory: { status: data.status, at: new Date(), actor: admin._id } } },
      );
      statusChanged = transitioned.modifiedCount === 1;
      if (statusChanged) enquiry.status = data.status;
    }
    await audit(admin._id, 'enquiry.update', 'Enquiry', id, { status: data.status });

    let statusNotification: 'pending' | 'sent' | 'failed' | 'disabled' | undefined;
    if (statusChanged) {
      const settings: any = await SiteSettings.findOne({ key: 'main' }).select('notificationPreferences').lean();
      const shouldNotify = settings?.notificationPreferences?.orderStatus === true;
      const recipient = String(enquiry.customerSnapshot?.email || '').trim();
      const statusEventId = randomUUID();
      const notificationKey = `status/${id}/${statusEventId}`;
      const notificationAllowed = orderStatusNotificationAllowed({
        contactConsent: enquiry.contactConsent,
        preference: shouldNotify,
        recipient,
      });
      const initialStatus = notificationAllowed ? 'pending' : 'disabled';
      await Enquiry.updateOne(
        { _id: id },
        { $push: { statusNotificationHistory: { status: enquiry.status, at: new Date(), statusEventId, notificationKey, deliveryStatus: initialStatus } } },
      );
      statusNotification = initialStatus;
      if (notificationAllowed) {
        statusNotification = await enqueueOrderStatusNotification({
          key: notificationKey,
          kind: 'enquiry-status',
          to: recipient,
          subject: `Enquiry ${enquiry.reference} status update · Hanumanji Agro`,
          html: statusUpdateEmail({ reference: enquiry.reference, name: enquiry.customerSnapshot?.name || 'there', status: enquiry.status }),
          entityType: 'Enquiry',
          entityId: id,
          statusField: 'notificationStatus',
          idField: 'notificationId',
          statusEventId,
        }, enqueueEmailNotification);
        await Enquiry.updateOne(
          { _id: id, 'statusNotificationHistory.statusEventId': statusEventId },
          { $set: { 'statusNotificationHistory.$.deliveryStatus': statusNotification } },
        );
      }
    }
    return NextResponse.json({ ok: true, ...(data.quotation ? { total: enquiry.quotation.total } : {}), ...(statusNotification ? { statusNotification } : {}) });
  } catch {
    return NextResponse.json({ error: 'Unable to save enquiry changes.' }, { status: 400 });
  }
}
