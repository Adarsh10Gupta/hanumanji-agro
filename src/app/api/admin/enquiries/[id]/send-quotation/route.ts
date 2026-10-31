import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { escapeHtml, sendEmail } from '@/lib/email';
import { Enquiry } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const quotationSchema = z.object({
  lines: z.array(z.object({ productName: z.string().trim().min(1).max(160), quantity: z.number().positive().max(1e9), unit: z.string().trim().max(24), unitPrice: z.number().min(0).max(1e12) })).min(1).max(30),
  transport: z.number().min(0).max(1e12),
  additionalCharges: z.number().min(0).max(1e12),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(3000).optional(),
  validUntil: z.string().datetime().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const large = tooLarge(req, 32 * 1024);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || process.env.DISABLE_EXTERNAL_NOTIFICATIONS === '1') return NextResponse.json({ error: 'Email delivery is unavailable; the quotation can be saved as a draft.' }, { status: 503 });

  try {
    const body = await req.json();
    const parsed = quotationSchema.safeParse(body.quotation);
    if (!parsed.success) return NextResponse.json({ error: 'Save a valid quotation with at least one priced product line before sending.' }, { status: 400 });
    const quotation = parsed.data;
    await db();
    const { id } = await params;
    const enquiry: any = await Enquiry.findById(id);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
    const recipient = enquiry.customerSnapshot?.email;
    if (!recipient) return NextResponse.json({ error: 'This customer has no email address.' }, { status: 400 });

    const base = quotation.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const total = base + quotation.transport + quotation.additionalCharges;
    if (!Number.isFinite(total)) return NextResponse.json({ error: 'The quotation total is invalid.' }, { status: 400 });
    enquiry.quotation = { ...quotation, total, validUntil: quotation.validUntil ? new Date(quotation.validUntil) : undefined };
    await enquiry.save();

    const rows = quotation.lines.map((line) => `<tr><td>${escapeHtml(line.productName)}</td><td>${escapeHtml(line.quantity)} ${escapeHtml(line.unit)}</td><td align="right">${currency.format(line.unitPrice)}</td><td align="right">${currency.format(line.quantity * line.unitPrice)}</td></tr>`).join('');
    const html = `<!doctype html><html><body style="margin:0;background:#f4f1e8;color:#29372a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffdf8;border:1px solid #e3dfd3"><tr><td style="background:#283b2b;padding:26px 32px;color:#fff;letter-spacing:2px">HANUMANJI AGRO</td></tr><tr><td style="padding:32px"><h1 style="font-size:24px;font-weight:500">Quotation ${escapeHtml(enquiry.reference)}</h1><p>Dear ${escapeHtml(enquiry.customerSnapshot?.name)},</p><p>Thank you for your enquiry. Please find your quotation below.</p><table width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse"><thead><tr><th align="left">Product</th><th align="left">Quantity</th><th align="right">Unit price</th><th align="right">Amount</th></tr></thead><tbody>${rows}</tbody></table><p align="right">Transportation: ${currency.format(quotation.transport)}<br/>Additional charges: ${currency.format(quotation.additionalCharges)}<br/><strong>Total: ${currency.format(total)}</strong></p><p>${escapeHtml(quotation.notes).replace(/\n/g, '<br/>')}</p><p><strong>Terms and conditions</strong><br/>${escapeHtml(quotation.terms).replace(/\n/g, '<br/>')}</p><p>Valid until: ${escapeHtml(quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-IN') : 'As discussed')}</p><p style="border-top:1px solid #e8e3d7;padding-top:18px;color:#6e7568;font-size:12px">Hanumanji Agro · Kalimpong, Northeast India</p></td></tr></table></td></tr></table></body></html>`;
    const fingerprint = createHash('sha256').update(JSON.stringify(quotation)).digest('hex');
    const delivery = await sendEmail({ to: recipient, subject: `Quotation ${enquiry.reference} · Hanumanji Agro`, html, idempotencyKey: `quotation/${id}/${fingerprint}` });
    if (delivery.status !== 'sent') return NextResponse.json({ error: delivery.status === 'pending' ? 'Email delivery is unavailable; the draft remains saved.' : 'Email provider did not accept the quotation. The draft remains saved.' }, { status: delivery.status === 'pending' ? 503 : 502 });

    const sentAt = new Date();
    enquiry.quotation.sentAt = sentAt;
    enquiry.quotation.emailId = delivery.id;
    if (enquiry.status !== 'Quotation Sent') {
      enquiry.status = 'Quotation Sent';
      enquiry.statusHistory.push({ status: 'Quotation Sent', at: sentAt, actor: admin._id });
    }
    await enquiry.save();
    await audit(admin._id, 'quotation.email_sent', 'Enquiry', id, { total, emailId: delivery.id });
    return NextResponse.json({ sent: true, total, sentAt });
  } catch {
    return NextResponse.json({ error: 'Unable to send quotation.' }, { status: 503 });
  }
}
