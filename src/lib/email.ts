export type EmailDelivery = { status: 'pending' | 'sent' | 'failed'; id?: string; errorCode?: string; httpStatus?: number };

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function brandedEmail(title: string, content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;color:#29372a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffdf8;border:1px solid #e3dfd3"><tr><td style="background:#283b2b;padding:26px 32px;color:#fff"><div style="font-size:12px;letter-spacing:2px">HANUMANJI AGRO</div><div style="font-size:11px;margin-top:6px;color:#d6dbc8">ROOTED IN NATURE</div></td></tr><tr><td style="padding:32px"><h1 style="font-size:24px;font-weight:500;margin:0 0 20px">${escapeHtml(title)}</h1>${content}<p style="border-top:1px solid #e8e3d7;padding-top:18px;color:#6e7568;font-size:12px">Hanumanji Agro · Kalimpong, Northeast India</p></td></tr></table></td></tr></table></body></html>`;
}

export function enquiryOwnerEmail(enquiry: {
  reference: string;
  type: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  products?: Array<{ name: string; quantity: number; unit?: string; grade?: string }>;
  location?: string;
  subject?: string;
  message?: string;
}) {
  const products = enquiry.products?.length
    ? enquiry.products.map((item) => `${escapeHtml(item.name)}${item.grade ? ` (${escapeHtml(item.grade)})` : ''} — ${escapeHtml(item.quantity)} ${escapeHtml(item.unit || '')}`.trim()).join('<br/>')
    : 'Not specified';
  const lines = [
    `<p>A new ${escapeHtml(enquiry.type.toLowerCase())} enquiry has been saved and is ready in the owner workspace.</p>`,
    `<p><strong>Reference:</strong> ${escapeHtml(enquiry.reference)}<br/><strong>Customer:</strong> ${escapeHtml(enquiry.name)}<br/><strong>Phone:</strong> ${escapeHtml(enquiry.phone)}<br/><strong>Email:</strong> ${escapeHtml(enquiry.email || 'Not provided')}<br/><strong>Company:</strong> ${escapeHtml(enquiry.company || 'Not provided')}</p>`,
    `<p><strong>Product and quantity</strong><br/>${products}<br/><strong>Delivery location:</strong> ${escapeHtml(enquiry.location || 'Not provided')}${enquiry.subject ? `<br/><strong>Subject:</strong> ${escapeHtml(enquiry.subject)}` : ''}</p>`,
    enquiry.message ? `<p><strong>Requirements</strong><br/>${escapeHtml(enquiry.message).replace(/\n/g, '<br/>')}</p>` : '',
  ].join('');
  return brandedEmail(`New enquiry · ${enquiry.reference}`, lines);
}

export function supplierOwnerEmail(supplier: { id: string; name: string; phone: string; email?: string; product: string; location: string; quantity?: string; period?: string; description?: string }) {
  const lines = [
    `<p>A new farmer or supplier enquiry has been saved and is ready in the owner workspace.</p>`,
    `<p><strong>Submission:</strong> ${escapeHtml(supplier.id)}<br/><strong>Supplier:</strong> ${escapeHtml(supplier.name)}<br/><strong>Phone:</strong> ${escapeHtml(supplier.phone)}<br/><strong>Email:</strong> ${escapeHtml(supplier.email || 'Not provided')}<br/><strong>Product:</strong> ${escapeHtml(supplier.product)}<br/><strong>Location:</strong> ${escapeHtml(supplier.location)}<br/><strong>Quantity:</strong> ${escapeHtml(supplier.quantity || 'Not provided')}<br/><strong>Availability:</strong> ${escapeHtml(supplier.period || 'Not provided')}</p>`,
    supplier.description ? `<p><strong>Details</strong><br/>${escapeHtml(supplier.description).replace(/\n/g, '<br/>')}</p>` : '',
  ].join('');
  return brandedEmail('New supplier enquiry', lines);
}

export function acknowledgementEmail(enquiry: { reference: string; name: string; type: string }) {
  return brandedEmail(`Thank you, ${enquiry.name}`, `<p>We have received your ${escapeHtml(enquiry.type.toLowerCase())} enquiry.</p><p>Your reference is <strong>${escapeHtml(enquiry.reference)}</strong>. Our team will review your requirements and get in touch.</p>`);
}

export function statusUpdateEmail(enquiry: { reference: string; name: string; status: string }) {
  return brandedEmail(`Enquiry update · ${enquiry.reference}`, `<p>Dear ${escapeHtml(enquiry.name)},</p><p>The status of your Hanumanji Agro enquiry <strong>${escapeHtml(enquiry.reference)}</strong> is now <strong>${escapeHtml(enquiry.status)}</strong>.</p><p>We will contact you if we need further information.</p>`);
}

export function emailIntegrationTestEmail() {
  return brandedEmail('Email integration test', '<p>This is the requested Hanumanji Agro email integration test.</p><p>The server connected to Resend and Resend accepted this message.</p>');
}

export async function sendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string; from?: string }): Promise<EmailDelivery> {
  if (process.env.DISABLE_EXTERNAL_NOTIFICATIONS === '1') return { status: 'pending', errorCode: 'notifications_disabled' };
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from || process.env.EMAIL_FROM;
  if (!apiKey || !from) return { status: 'pending', errorCode: !apiKey ? 'api_key_missing' : 'sender_missing' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(12_000),
    });
    let data: { id?: string; name?: string } | null = null;
    try { data = await response.json() as { id?: string; name?: string }; } catch { /* Provider response details are intentionally not logged. */ }
    if (!response.ok) {
      const errorCode = typeof data?.name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.name) ? data.name : 'provider_rejected';
      return { status: 'failed', errorCode, httpStatus: response.status };
    }
    return data?.id ? { status: 'sent', id: data.id } : { status: 'failed', errorCode: 'invalid_provider_response', httpStatus: response.status };
  } catch (error) {
    return { status: 'failed', errorCode: error instanceof Error && error.name === 'TimeoutError' ? 'provider_timeout' : 'network_error' };
  }
}
