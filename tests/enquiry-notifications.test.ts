import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { notifyEnquiryOwner } from '../src/lib/enquiry-notifications';
import { enquiryOwnerEmail } from '../src/lib/email';

const enquiry = {
  reference: 'HA-2026-ABC123',
  type: 'Quotation',
  name: 'Rahul',
  phone: '919876543210',
  email: 'rahul@example.com',
  subject: 'Wholesale order',
  message: 'Please share pricing.',
  destination: { city: 'Kolkata', state: 'West Bengal' },
  items: [{ quantity: 500, unit: 'litres', snapshot: { name: 'Mustard Oil' } }],
};

test('enabled new enquiry queues one detailed owner notification with stable deduplication', async () => {
  const queued: Array<{ to: string; key: string; html: string }> = [];
  const recorded: Array<{ status: string; id?: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    entityId: '507f1f77bcf86cd799439011',
    recipient: 'owner-controlled@example.com',
    enabled: true,
    enqueue: async (input) => {
      queued.push({ to: input.to, key: input.key, html: input.html });
      return { status: 'pending', queued: true };
    },
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(queued.length, 1);
  assert.equal(queued[0].to, 'owner-controlled@example.com');
  assert.equal(queued[0].key, 'enquiry-owner/HA-2026-ABC123');
  assert.match(queued[0].html, /HA-2026-ABC123/);
  assert.match(queued[0].html, /Rahul/);
  assert.match(queued[0].html, /rahul@example\.com/);
  assert.match(queued[0].html, /919876543210/);
  assert.match(queued[0].html, /Mustard Oil — 500 litres/);
  assert.match(queued[0].html, /Kolkata, West Bengal/);
  assert.match(queued[0].html, /Please share pricing\./);
  assert.deepEqual(recorded, [{ status: 'pending', queued: true }]);
  assert.equal(result.status, 'pending');
  assert.equal(result.queued, true);
  assert.equal(result.recorded, true);
});

test('disabled owner notification preference skips queuing and records disabled status', async () => {
  let enqueueCount = 0;
  const recorded: Array<{ status: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    entityId: '507f1f77bcf86cd799439011',
    recipient: 'owner-controlled@example.com',
    enabled: false,
    enqueue: async () => {
      enqueueCount += 1;
      return { status: 'pending', queued: true };
    },
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(enqueueCount, 0);
  assert.deepEqual(recorded, [{ status: 'disabled', queued: false }]);
  assert.equal(result.status, 'disabled');
  assert.equal(result.recorded, true);
});

test('global budget or queue rejection is recorded as failed without losing the saved enquiry', async () => {
  const recorded: Array<{ status: string; errorCode?: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    entityId: '507f1f77bcf86cd799439011',
    recipient: 'owner-controlled@example.com',
    enabled: true,
    enqueue: async () => ({ status: 'failed', errorCode: 'daily_email_budget_exceeded', queued: false }),
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'daily_email_budget_exceeded');
  assert.equal(result.recorded, true);
  assert.deepEqual(recorded, [{ status: 'failed', errorCode: 'daily_email_budget_exceeded', queued: false }]);
});

test('queue and recording failures are surfaced without throwing after enquiry creation', async () => {
  const queueResult = await notifyEnquiryOwner({
    enquiry,
    entityId: '507f1f77bcf86cd799439011',
    recipient: 'owner-controlled@example.com',
    enabled: true,
    enqueue: async () => { throw new Error('test-only queue failure'); },
    record: async () => {},
  });
  assert.equal(queueResult.status, 'failed');
  assert.equal(queueResult.errorCode, 'notification_queue_error');

  const recordResult = await notifyEnquiryOwner({
    enquiry,
    entityId: '507f1f77bcf86cd799439011',
    recipient: 'owner-controlled@example.com',
    enabled: true,
    enqueue: async () => ({ status: 'pending', queued: true }),
    record: async () => { throw new Error('test-only persistence failure'); },
  });
  assert.equal(recordResult.status, 'pending');
  assert.equal(recordResult.recorded, false);
});

test('owner email escapes customer content and displays each enquiry field', () => {
  const html = enquiryOwnerEmail({
    ...enquiry,
    name: '<Rahul>',
    message: '<script>no</script>',
    products: [{ quantity: 500, unit: 'litres', name: '<Mustard Oil>' }],
  });
  assert.match(html, /&lt;Rahul&gt;/);
  assert.match(html, /&lt;Mustard Oil&gt; — 500 litres/);
  assert.doesNotMatch(html, /<script>no<\/script>/);
});

test('public enquiry route records notification outcomes and reuses stable enquiry idempotency on retries', async () => {
  const route = await readFile('src/app/api/enquiries/route.ts', 'utf8');
  const supplierRoute = await readFile('src/app/api/suppliers/route.ts', 'utf8');
  assert.match(route, /process\.env\.OWNER_NOTIFICATION_EMAIL\?\.trim\(\)\s*\|\|\s*settings\?\.notificationEmail/);
  assert.match(route, /settingsAvailable && preferences\.ownerEmail !== false/);
  assert.match(route, /notification\.enquiry_owner/);
  assert.match(route, /providerMessageId:\s*outcome\.id/);
  assert.match(route, /notificationStatus:\s*outcome\.status/);
  assert.match(route, /findOne\(\{ idempotencyKey: keyResult\.data \}\)/);
  assert.match(route, /enqueueEmailNotification/);
  assert.match(supplierRoute, /enqueueEmailNotification/);
  assert.doesNotMatch(route, /collection\.createIndex|sendEmail\(/);
  assert.doesNotMatch(supplierRoute, /collection\.createIndex|sendEmail\(/);
});
