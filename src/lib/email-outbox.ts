import { randomUUID } from 'node:crypto';
import { db } from './db';
import { EmailOutbox, Enquiry, SiteSettings, SupplierEnquiry } from './models';
import { emailDailyBudget, emailQueueCapacity, nextUtcDay, reconcilePendingEmails, releasePendingEmail, reservePendingEmail } from './email-budget';
import { sendEmail } from './email';

const MAX_ATTEMPTS = 3;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_MS = 30_000;

export async function commitLeasedNotification(input: {
  transition: () => Promise<boolean>;
  updateEntity: () => Promise<void>;
}) {
  if (!await input.transition()) return false;
  await input.updateEntity();
  return true;
}

export type QueuedEmail = {
  key: string;
  kind: 'enquiry-owner' | 'enquiry-acknowledgement' | 'supplier-owner' | 'enquiry-status' | 'enquiry-quotation';
  to: string;
  subject: string;
  html: string;
  entityType: 'Enquiry' | 'SupplierEnquiry';
  entityId: string;
  statusField: 'notificationStatus' | 'acknowledgementStatus' | 'quotationStatus';
  idField: 'notificationId' | 'acknowledgementId' | 'quotationId';
  statusEventId?: string;
};

export type QueueResult = {
  status: 'pending' | 'sent' | 'failed';
  id?: string;
  errorCode?: string;
  httpStatus?: number;
  queued: boolean;
  duplicate?: boolean;
};

function currentResult(job: { status: string; providerMessageId?: string; errorCode?: string; httpStatus?: number }): QueueResult {
  if (job.status === 'sent') return { status: 'sent', id: job.providerMessageId, queued: false, duplicate: true };
  if (job.status === 'queued' || job.status === 'processing') return { status: 'pending', queued: true, duplicate: true };
  return { status: 'failed', errorCode: job.errorCode || 'notification_failed', httpStatus: job.httpStatus, queued: false, duplicate: true };
}

export async function enqueueEmailNotification(input: QueuedEmail, retryFailed = false): Promise<QueueResult> {
  await db();
  const existing = await EmailOutbox.findOne({ key: input.key }).lean();
  if (existing && !(retryFailed && existing.status === 'failed' && existing.attempts < MAX_ATTEMPTS)) return currentResult(existing);

  if (!await reservePendingEmail(input.key)) {
    return { status: 'failed', errorCode: 'notification_queue_full', queued: false };
  }
  if (existing) {
    const retried = await EmailOutbox.findOneAndUpdate(
      { _id: existing._id, status: 'failed', attempts: { $lt: MAX_ATTEMPTS } },
      {
        $set: { ...input, status: 'queued', availableAt: new Date() },
        $unset: { leaseExpiresAt: 1, leaseToken: 1, deleteAt: 1, errorCode: 1, httpStatus: 1 },
      },
      { new: true },
    ).lean();
    if (retried) {
      await updateTarget(retried, 'pending');
      return { status: 'pending', queued: true };
    }
    const latest = await EmailOutbox.findOne({ key: input.key }).lean();
    if (latest?.status === 'queued' || latest?.status === 'processing') return currentResult(latest);
    await releasePendingEmail(input.key);
    return latest ? currentResult(latest) : { status: 'failed', errorCode: 'notification_retry_unavailable', queued: false };
  }

  try {
    await EmailOutbox.create({ ...input, status: 'queued', attempts: 0, availableAt: new Date() });
    return { status: 'pending', queued: true };
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) {
      await releasePendingEmail(input.key);
      throw error;
    }
    const latest = await EmailOutbox.findOne({ key: input.key }).lean();
    if (latest?.status === 'queued' || latest?.status === 'processing') return currentResult(latest);
    await releasePendingEmail(input.key);
    return latest ? currentResult(latest) : { status: 'failed', errorCode: 'notification_enqueue_failed', queued: false };
  }
}

function retryable(errorCode?: string, httpStatus?: number) {
  return errorCode === 'provider_timeout'
    || errorCode === 'network_error'
    || errorCode === 'email_budget_unavailable'
    || Boolean(httpStatus && httpStatus >= 500);
}

export function shouldRetryEmail(errorCode: string | undefined, httpStatus: number | undefined, attempts: number) {
  return retryable(errorCode, httpStatus) && attempts < MAX_ATTEMPTS;
}

async function updateTarget(job: {
  key?: string;
  kind?: string;
  statusEventId?: string;
  entityType: 'Enquiry' | 'SupplierEnquiry';
  entityId: unknown;
  statusField: 'notificationStatus' | 'acknowledgementStatus' | 'quotationStatus';
  idField: 'notificationId' | 'acknowledgementId' | 'quotationId';
}, status: 'pending' | 'sent' | 'failed' | 'disabled', id?: string) {
  if (job.kind === 'enquiry-status') {
    if (!job.statusEventId) return;
    await Enquiry.updateOne(
      { _id: job.entityId, 'statusNotificationHistory.statusEventId': job.statusEventId },
      { $set: { 'statusNotificationHistory.$.deliveryStatus': status, ...(id ? { 'statusNotificationHistory.$.emailId': id } : {}) } },
    );
    return;
  }
  const model = job.entityType === 'Enquiry' ? Enquiry : SupplierEnquiry;
  await model.updateOne(
    { _id: job.entityId },
    { $set: { [job.statusField]: status, ...(id ? { [job.idField]: id } : {}) } },
  );
}

export async function processNextEmailNotification() {
  await db();
  const now = new Date();
  const exhausted = await EmailOutbox.findOneAndUpdate(
    { status: 'processing', attempts: { $gte: MAX_ATTEMPTS }, leaseExpiresAt: { $lte: now } },
    { $set: { status: 'failed', errorCode: 'retry_limit_reached', deleteAt: new Date(now.getTime() + RETENTION_MS) }, $unset: { leaseExpiresAt: 1, leaseToken: 1 } },
    { new: true },
  ).lean();
  if (exhausted) {
    await updateTarget(exhausted, 'failed');
    await releasePendingEmail(exhausted.key);
    return true;
  }
  const leaseToken = randomUUID();
  const job = await EmailOutbox.findOneAndUpdate(
    {
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { status: 'queued', availableAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: { status: 'processing', leaseExpiresAt: new Date(now.getTime() + LEASE_MS), leaseToken },
      $inc: { attempts: 1 },
    },
    { sort: { availableAt: 1, createdAt: 1 }, new: true },
  ).lean();
  if (!job) return false;

  if (job.kind === 'enquiry-quotation') {
    const enquiry = await Enquiry.findById(job.entityId).select('contactConsent customerSnapshot.email').lean<{ contactConsent?: boolean; customerSnapshot?: { email?: string } } | null>();
    if (!enquiry?.contactConsent || !enquiry.customerSnapshot?.email?.trim()) {
      const cancelled = await commitLeasedNotification({
        transition: async () => {
          const result = await EmailOutbox.updateOne(
            { _id: job._id, status: 'processing', leaseToken },
            { $set: { status: 'cancelled', errorCode: 'quotation_no_longer_permitted', deleteAt: new Date(Date.now() + RETENTION_MS) }, $unset: { leaseExpiresAt: 1, leaseToken: 1 } },
          );
          return result.modifiedCount === 1;
        },
        updateEntity: () => updateTarget(job, 'disabled'),
      });
      if (cancelled) await releasePendingEmail(job.key);
      return true;
    }
  }

  if (job.kind === 'enquiry-acknowledgement' || job.kind === 'enquiry-status') {
    const preference = job.kind === 'enquiry-status'
      ? 'orderStatus'
      : 'customerAcknowledgement';
    const [enquiry, settings] = await Promise.all([
      Enquiry.findById(job.entityId).select('contactConsent').lean<{ contactConsent?: boolean } | null>(),
      SiteSettings.findOne({ key: 'main' }).select('notificationPreferences').lean<{ notificationPreferences?: { customerAcknowledgement?: boolean; orderStatus?: boolean } } | null>(),
    ]);
    if (!enquiry?.contactConsent || settings?.notificationPreferences?.[preference] !== true) {
      const cancelled = await commitLeasedNotification({
        transition: async () => {
          const result = await EmailOutbox.updateOne(
            { _id: job._id, status: 'processing', leaseToken },
            { $set: { status: 'cancelled', errorCode: `${preference}_no_longer_permitted`, deleteAt: new Date(Date.now() + RETENTION_MS) }, $unset: { leaseExpiresAt: 1, leaseToken: 1 } },
          );
          return result.modifiedCount === 1;
        },
        updateEntity: () => updateTarget(job, 'disabled'),
      });
      if (cancelled) {
        await releasePendingEmail(job.key);
      }
      return true;
    }
  }

  let delivery;
  try {
    delivery = await sendEmail({ to: job.to, subject: job.subject, html: job.html, idempotencyKey: job.key });
  } catch {
    delivery = { status: 'failed' as const, errorCode: 'email_budget_unavailable' };
  }

  const completedAt = new Date();
  if (delivery.status === 'pending' && delivery.errorCode === 'daily_email_budget_exceeded') {
    await EmailOutbox.updateOne(
      { _id: job._id, status: 'processing', leaseToken },
      {
        $set: { status: 'queued', availableAt: nextUtcDay(completedAt), errorCode: 'daily_email_budget_deferred' },
        $inc: { attempts: -1 },
        $unset: { leaseExpiresAt: 1, leaseToken: 1 },
      },
    );
    return true;
  }

  const shouldRetry = delivery.status === 'failed' && shouldRetryEmail(delivery.errorCode, delivery.httpStatus, job.attempts);
  const terminalStatus = delivery.status === 'sent' ? 'sent' : 'failed';
  const update = shouldRetry
    ? {
      $set: { status: 'queued', availableAt: new Date(completedAt.getTime() + job.attempts * 30_000), errorCode: delivery.errorCode, httpStatus: delivery.httpStatus },
      $unset: { leaseExpiresAt: 1, leaseToken: 1 },
    }
    : {
      $set: { status: terminalStatus, deleteAt: new Date(completedAt.getTime() + RETENTION_MS), ...(delivery.id ? { providerMessageId: delivery.id } : {}), errorCode: delivery.errorCode, httpStatus: delivery.httpStatus },
      $unset: { leaseExpiresAt: 1, leaseToken: 1 },
    };
  const completed = shouldRetry
    ? (await EmailOutbox.updateOne({ _id: job._id, status: 'processing', leaseToken }, update)).modifiedCount === 1
    : await commitLeasedNotification({
      transition: async () => (await EmailOutbox.updateOne({ _id: job._id, status: 'processing', leaseToken }, update)).modifiedCount === 1,
      updateEntity: () => updateTarget(job, terminalStatus, delivery.id),
    });
  if (completed && !shouldRetry) await releasePendingEmail(job.key);
  return true;
}

export async function expireStaleEmailNotifications(now = new Date()) {
  await db();
  const cutoff = new Date(now.getTime() - MAX_PENDING_AGE_MS);
  const jobs = await EmailOutbox.find({
    createdAt: { $lt: cutoff },
    $or: [
      { status: 'queued' },
      { status: 'processing', leaseExpiresAt: { $lte: now } },
    ],
  })
    .select('key entityType entityId statusField idField leaseToken')
    .limit(emailQueueCapacity())
    .lean();
  for (const job of jobs) {
    const result = await EmailOutbox.updateOne(
      {
        _id: job._id,
        createdAt: { $lt: cutoff },
        $or: [
          { status: 'queued' },
          { status: 'processing', leaseExpiresAt: { $lte: now } },
        ],
      },
      { $set: { status: 'failed', errorCode: 'notification_expired', deleteAt: new Date(now.getTime() + RETENTION_MS) }, $unset: { leaseExpiresAt: 1, leaseToken: 1 } },
    );
    if (result.modifiedCount) {
      await updateTarget(job, 'failed');
      await releasePendingEmail(job.key);
    }
  }
}

export async function reconcileEmailQueue() {
  await db();
  const active = await EmailOutbox.find({ status: { $in: ['queued', 'processing'] } }).select('key').lean();
  await reconcilePendingEmails(active.map((job) => job.key));
}

export { emailDailyBudget, emailQueueCapacity };
