import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { acknowledgementEmail } from '@/lib/email';
import { enqueueEmailNotification } from '@/lib/email-outbox';
import { notifyEnquiryOwner } from '@/lib/enquiry-notifications';
import { db } from '@/lib/db';
import { Customer, Enquiry, Product, SiteSettings } from '@/lib/models';
import { audit, rateLimit, readJsonBody, sameOrigin } from '@/lib/security';
import { MAX_ENQUIRY_PRODUCTS, publicPhoneSchema, enquiryUnitSchema, distinctObjectIds } from '@/lib/validation';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 40 * 1024;

const emailSchema = z.union([z.string().trim().email().max(254).transform((email) => email.toLowerCase()), z.literal('')]).optional();
const itemSchema = z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), quantity: z.number().finite().positive().max(1e6), unit: enquiryUnitSchema.default('kg') });
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: publicPhoneSchema,
  email: emailSchema,
  customerType: z.enum(['Individual', 'Business']),
  company: z.string().trim().max(160).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().max(3000).optional(),
  consent: z.literal(true),
  enquiryType: z.enum(['Quotation', 'Business', 'Contact']).default('Quotation'),
  items: z.array(itemSchema).max(MAX_ENQUIRY_PRODUCTS).default([]),
}).superRefine((data, ctx) => {
  if (distinctObjectIds(data.items.map((item) => item.productId)) > MAX_ENQUIRY_PRODUCTS) {
    ctx.addIssue({ code: 'custom', path: ['items'], message: 'A maximum of 30 distinct products is allowed.' });
  }
  if (data.enquiryType === 'Quotation' && data.items.length === 0) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Add at least one product.' });
  if (data.enquiryType === 'Business' && (!data.subject || data.subject.length < 2)) ctx.addIssue({ code: 'custom', path: ['subject'], message: 'Add an enquiry subject.' });
});

const validIdempotencyKey = z.string().uuid();

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const keyResult = validIdempotencyKey.safeParse(req.headers.get('idempotency-key'));
  if (!keyResult.success) return NextResponse.json({ error: 'A valid submission key is required. Please retry the form.' }, { status: 400 });

  try {
    const limit = await rateLimit(req, 'public-enquiry', 8);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: 'Please check the enquiry details.' }, { status: 400 });

    const data = parsed.data;
    await db();
    const existing: any = await Enquiry.findOne({ idempotencyKey: keyResult.data }).select('reference notificationStatus acknowledgementStatus').lean();
    if (existing) return NextResponse.json({ reference: existing.reference, notificationStatus: existing.notificationStatus, acknowledgementStatus: existing.acknowledgementStatus, duplicate: true }, { status: 200 });

    const productIds = [...new Set(data.items.map((item) => item.productId.toLowerCase()))];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds }, published: true, archivedAt: { $exists: false } }).lean()
      : [];
    if (products.length !== productIds.length) return NextResponse.json({ error: 'One or more products are no longer available.' }, { status: 400 });

    const customer = await Customer.findOneAndUpdate(
      { phone: data.phone },
      { $set: { name: data.name, ...(data.email ? { email: data.email } : {}), company: data.company || '', type: data.customerType } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    const reference = `HA-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let enquiry;
    try {
      enquiry = await Enquiry.create({
        reference,
        idempotencyKey: keyResult.data,
        customer: customer._id,
        customerSnapshot: { name: data.name, phone: data.phone, email: data.email || '', company: data.company || '', type: data.customerType },
        enquiryType: data.enquiryType,
        items: data.items.map((item) => ({ productId: item.productId, snapshot: products.find((product) => String(product._id).toLowerCase() === item.productId.toLowerCase()), quantity: item.quantity, unit: item.unit })),
        destination: { city: data.city || '', state: data.state || '' },
        subject: data.subject || '',
        message: data.message || '',
        contactConsent: data.consent,
        consentedAt: new Date(),
        statusHistory: [{ status: 'New', at: new Date() }],
      });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        const duplicate: any = await Enquiry.findOne({ idempotencyKey: keyResult.data }).select('reference notificationStatus acknowledgementStatus').lean();
        if (duplicate) return NextResponse.json({ reference: duplicate.reference, notificationStatus: duplicate.notificationStatus, acknowledgementStatus: duplicate.acknowledgementStatus, duplicate: true }, { status: 200 });
      }
      throw error;
    }

    let settings: any;
    let settingsAvailable = true;
    try {
      settings = await SiteSettings.findOne({ key: 'main' }).select('notificationEmail notificationPreferences').lean();
    } catch {
      settingsAvailable = false;
    }
    const preferences = settings?.notificationPreferences || { ownerEmail: true, customerAcknowledgement: false };
    const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL?.trim() || settings?.notificationEmail?.trim();
    const ownerNotification = await notifyEnquiryOwner({
      enquiry: {
        reference,
        type: data.enquiryType,
        name: data.name,
        phone: data.phone,
        email: data.email,
        company: data.company,
        subject: data.subject,
        message: data.message,
        destination: { city: data.city, state: data.state },
        items: data.items.map((item) => ({
          quantity: item.quantity,
          unit: item.unit,
          snapshot: { name: products.find((product) => String(product._id).toLowerCase() === item.productId.toLowerCase())?.name },
        })),
      },
      recipient: ownerEmail,
      enabled: settingsAvailable && preferences.ownerEmail !== false,
      available: settingsAvailable,
      entityId: String(enquiry._id),
      record: async (outcome) => {
        let persisted = true;
        if (!outcome.queued) {
          try {
            await Enquiry.updateOne(
              { _id: enquiry._id },
              { $set: { notificationStatus: outcome.status, ...(outcome.id ? { notificationId: outcome.id } : {}) } },
            );
          } catch {
            persisted = false;
          }
        }
        try {
          await audit(undefined, outcome.queued ? 'notification.enquiry_owner_queued' : 'notification.enquiry_owner', 'Enquiry', String(enquiry._id), {
            provider: 'Resend',
            status: outcome.status,
            queued: outcome.queued,
            ...(outcome.id ? { providerMessageId: outcome.id } : {}),
            ...('errorCode' in outcome && outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
            ...('httpStatus' in outcome && outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
          });
        } catch {
          persisted = false;
        }
        if (!persisted) throw new Error('Enquiry owner notification outcome could not be fully recorded.');
      },
    });
    if (!ownerNotification.recorded) console.error('Could not fully record enquiry owner notification outcome.', { reference });
    const notificationStatus = ownerNotification.status;
    const customerAcknowledgementEnabled = preferences.customerAcknowledgement === true;
    let acknowledgementStatus: 'pending' | 'sent' | 'failed' | 'disabled' = customerAcknowledgementEnabled ? 'pending' : 'disabled';
    let acknowledgementId: string | undefined;
    if (customerAcknowledgementEnabled && data.consent && data.email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.DISABLE_EXTERNAL_NOTIFICATIONS !== '1') {
      try {
        const queued = await enqueueEmailNotification({
          key: `enquiry-customer/${reference}`,
          kind: 'enquiry-acknowledgement',
          to: data.email,
          subject: `We received your enquiry ${reference} · Hanumanji Agro`,
          html: acknowledgementEmail({ reference, name: data.name, type: data.enquiryType }),
          entityType: 'Enquiry',
          entityId: String(enquiry._id),
          statusField: 'acknowledgementStatus',
          idField: 'acknowledgementId',
        });
        acknowledgementStatus = queued.status;
        acknowledgementId = queued.id;
        if (!queued.queued) {
          await Enquiry.updateOne(
            { _id: enquiry._id },
            { $set: { acknowledgementStatus, ...(acknowledgementId ? { acknowledgementId } : {}) } },
          );
        }
      } catch {
        acknowledgementStatus = 'failed';
        try {
          await Enquiry.updateOne({ _id: enquiry._id }, { $set: { acknowledgementStatus } });
        } catch {
          console.error('Could not record customer acknowledgement outcome.', { reference, status: acknowledgementStatus });
        }
      }
    }
    if (!customerAcknowledgementEnabled) {
      try {
        await Enquiry.updateOne({ _id: enquiry._id }, { $set: { acknowledgementStatus } });
      } catch {
        console.error('Could not record customer acknowledgement outcome.', { reference, status: acknowledgementStatus });
      }
    } else if (!data.consent || !data.email || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || process.env.DISABLE_EXTERNAL_NOTIFICATIONS === '1') {
      try {
        await Enquiry.updateOne({ _id: enquiry._id }, { $set: { acknowledgementStatus } });
      } catch {
        console.error('Could not record customer acknowledgement outcome.', { reference, status: acknowledgementStatus });
      }
    }

    return NextResponse.json({ reference, notificationStatus, acknowledgementStatus }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to save your enquiry right now.' }, { status: 503 });
  }
}
