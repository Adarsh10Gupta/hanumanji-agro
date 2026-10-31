import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { owner } from '@/lib/auth';
import { emailIntegrationTestEmail, sendEmail } from '@/lib/email';
import { audit, sameOrigin, tooLarge } from '@/lib/security';

export const runtime = 'nodejs';

const testSender = 'Hanumanji Agro <onboarding@resend.dev>';
const testSubject = 'Hanumanji Agro — Email Integration Test';

export async function POST(req: NextRequest) {
  const admin = await owner();
  if (!admin) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const large = tooLarge(req, 1024);
  if (large) return large;
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === '1') return NextResponse.json({ error: 'External email is disabled in this environment.' }, { status: 503 });

  const recipient = process.env.OWNER_NOTIFICATION_EMAIL?.trim();
  if (!process.env.RESEND_API_KEY || !recipient) return NextResponse.json({ error: 'Configure the Resend API key and owner notification address first.' }, { status: 503 });

  const day = new Date().toISOString().slice(0, 10);
  const requestId = createHash('sha256').update(`resend-test:${String(admin._id)}:${day}`).digest('hex').slice(0, 32);
  const delivery = await sendEmail({
    to: recipient,
    from: testSender,
    subject: testSubject,
    html: emailIntegrationTestEmail(),
    idempotencyKey: `resend-test/${requestId}`,
  });

  if (delivery.status !== 'sent' || !delivery.id) {
    try {
      await audit(admin._id, 'email.integration_test_failed', 'EmailIntegration', requestId, {
        provider: 'Resend',
        errorCode: delivery.errorCode || 'delivery_failed',
        ...(delivery.httpStatus ? { httpStatus: delivery.httpStatus } : {}),
      });
    } catch { /* Do not expose provider or database internals in the response. */ }
    return NextResponse.json({ error: 'Resend did not accept the test email.', code: delivery.errorCode || 'delivery_failed', ...(delivery.httpStatus ? { providerStatus: delivery.httpStatus } : {}) }, { status: delivery.status === 'pending' ? 503 : 502 });
  }

  try {
    await audit(admin._id, 'email.integration_test_sent', 'EmailIntegration', requestId, {
      provider: 'Resend',
      providerMessageId: delivery.id,
      sender: 'onboarding@resend.dev',
    });
  } catch {
    return NextResponse.json({ error: 'Resend accepted the message, but its message ID could not be recorded. Retry is idempotent for today.' }, { status: 503 });
  }

  return NextResponse.json({ sent: true, messageId: delivery.id });
}
