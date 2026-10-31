export const DEFAULT_BUSINESS_WHATSAPP = '+91 9876543210';

export function normalizeWhatsAppNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, '');
  const internationalPrefix = trimmed.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!internationalPrefix && digits.length === 10) digits = `91${digits}`;
  if (!internationalPrefix && digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;

  return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

export function formatWhatsAppNumber(value: string): string | null {
  const digits = normalizeWhatsAppNumber(value);
  if (!digits) return null;
  return digits.startsWith('91') && digits.length === 12
    ? `+91 ${digits.slice(2)}`
    : `+${digits}`;
}

type WhatsAppEnquiry = {
  reference?: string;
  subject?: string;
  message?: string;
  enquiryType?: string;
  destination?: { city?: string; state?: string };
  customerSnapshot?: { name?: string; type?: string };
  items?: Array<{
    quantity?: number;
    unit?: string;
    snapshot?: {
      name?: string;
      grade?: string;
      specifications?: Record<string, unknown>;
    };
  }>;
};

export function buildWhatsAppReplyMessage(enquiry: WhatsAppEnquiry): string {
  const name = enquiry.customerSnapshot?.name?.trim();
  const lines = (enquiry.items || []).map((item) => {
    const product = item.snapshot?.name || 'Product';
    const quantity = item.quantity !== undefined ? `${item.quantity} ${item.unit || ''} of ` : '';
    const grade = item.snapshot?.grade ? `, grade ${item.snapshot.grade}` : '';
    const specifications = Object.entries(item.snapshot?.specifications || {})
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    return `${quantity}${product}${grade}${specifications ? ` (${specifications})` : ''}`;
  });
  const destination = [enquiry.destination?.city, enquiry.destination?.state].filter(Boolean).join(', ');
  const enquiryDescription = lines.length
    ? lines.join('; ')
    : enquiry.subject || `${enquiry.enquiryType?.toLowerCase() || 'business'} enquiry`;
  const destinationText = destination ? ` for delivery to ${destination}` : '';
  const typeText = enquiry.customerSnapshot?.type === 'Business' ? ' for business supply' : '';
  const originalMessage = enquiry.message?.trim();

  return [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    'Thank you for contacting Hanumanji Agro.',
    '',
    `We received your enquiry${enquiry.reference ? ` ${enquiry.reference}` : ''} regarding ${enquiryDescription}${typeText}${destinationText}.`,
    '',
    'Our team would be happy to discuss pricing, availability and delivery arrangements with you.',
    '',
    'Please let us know a convenient time to connect.',
    ...(originalMessage ? ['', `Your message: ${originalMessage}`] : []),
    '',
    'Regards,',
    'Hanumanji Agro',
  ].join('\n');
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const digits = normalizeWhatsAppNumber(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
