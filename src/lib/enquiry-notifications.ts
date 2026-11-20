import { enqueueEmailNotification, type QueueResult } from './email-outbox';
import { enquiryOwnerEmail } from './email';

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

type NotificationOutcome = QueueResult | {
  status: 'disabled';
  queued: false;
  id?: string;
  errorCode?: string;
  httpStatus?: number;
};
type Enqueue = typeof enqueueEmailNotification;

export async function notifyEnquiryOwner(input: {
  enquiry: OwnerEnquiryEmail;
  entityId: string;
  recipient?: string;
  enabled: boolean;
  available?: boolean;
  enqueue?: Enqueue;
  record: (outcome: NotificationOutcome) => Promise<void>;
}) {
  let outcome: NotificationOutcome;

  if (input.available === false) {
    outcome = { status: 'pending', errorCode: 'notification_settings_unavailable', queued: false };
  } else if (!input.enabled) {
    outcome = { status: 'disabled', queued: false };
  } else if (!input.recipient) {
    outcome = { status: 'pending', errorCode: 'owner_recipient_missing', queued: false };
  } else {
    const products = (input.enquiry.items || []).map((item) => ({
      name: item.snapshot?.name || 'Product',
      quantity: item.quantity,
      unit: item.unit,
      grade: item.snapshot?.grade,
    }));
    const location = [input.enquiry.destination?.city, input.enquiry.destination?.state].filter(Boolean).join(', ');

    try {
      outcome = await (input.enqueue || enqueueEmailNotification)({
        key: `enquiry-owner/${input.enquiry.reference}`,
        kind: 'enquiry-owner',
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
        entityType: 'Enquiry',
        entityId: input.entityId,
        statusField: 'notificationStatus',
        idField: 'notificationId',
      });
    } catch {
      outcome = { status: 'failed', errorCode: 'notification_queue_error', queued: false };
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
