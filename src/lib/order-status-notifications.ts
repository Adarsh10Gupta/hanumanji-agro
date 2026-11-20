import type { QueueResult, QueuedEmail } from './email-outbox';

export function orderStatusNotificationAllowed(input: {
  contactConsent?: boolean;
  preference?: boolean;
  recipient?: string;
}): input is { contactConsent: true; preference: true; recipient: string } {
  return input.contactConsent === true && input.preference === true && Boolean(input.recipient?.trim());
}

export async function enqueueOrderStatusNotification(
  job: QueuedEmail,
  enqueue: (queued: QueuedEmail) => Promise<QueueResult>,
): Promise<QueueResult['status']> {
  try {
    return (await enqueue(job)).status;
  } catch {
    return 'failed';
  }
}
