import { enquiryOwnerEmail, sendEmail, type EmailDelivery } from './email';

type OwnerEnquiryEmail = {
  reference: string;
  type: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  subject?: string;
  message?: string;
  destination?: { city?: string; state?: string };
  items?: Array<{ quantity: number; unit?: string; snapshot?: { name?: string; grade?: string } }>;
};

type NotificationOutcome = {
  status: EmailDelivery['status'] | 'disabled';
  id?: string;
  errorCode?: string;
  httpStatus?: number;
};
type Send = typeof sendEmail;

export async function notifyEnquiryOwner(input: {
  enquiry: OwnerEnquiryEmail;
  recipient?: string;
  enabled: boolean;
  available?: boolean;
  send?: Send;
  record: (outcome: NotificationOutcome) => Promise<void>;
}) {
  let outcome: NotificationOutcome;

  if (input.available === false) {
    outcome = { status: 'pending', errorCode: 'notification_settings_unavailable' };
  } else if (!input.enabled) {
    outcome = { status: 'disabled' };
  } else if (!input.recipient) {
    outcome = { status: 'pending', errorCode: 'owner_recipient_missing' };
  } else {
    const products = (input.enquiry.items || []).map((item) => ({
      name: item.snapshot?.name || 'Product',
      quantity: item.quantity,
      unit: item.unit,
      grade: item.snapshot?.grade,
    }));
    const location = [input.enquiry.destination?.city, input.enquiry.destination?.state].filter(Boolean).join(', ');

    try {
      outcome = await (input.send || sendEmail)({
        to: input.recipient,
        subject: `New enquiry ${input.enquiry.reference} · Hanumanji Agro`,
        html: enquiryOwnerEmail({
          reference: input.enquiry.reference,
          type: input.enquiry.type,
          name: input.enquiry.name,
          phone: input.enquiry.phone,
          email: input.enquiry.email,
          company: input.enquiry.company,
          products,
          location,
          subject: input.enquiry.subject,
          message: input.enquiry.message,
        }),
        idempotencyKey: `enquiry-owner/${input.enquiry.reference}`,
      });
    } catch {
      outcome = { status: 'failed', errorCode: 'notification_send_error' };
    }
  }

  let recorded = true;
  try {
    await input.record(outcome);
  } catch {
    recorded = false;
  }

  return { ...outcome, recorded };
}
