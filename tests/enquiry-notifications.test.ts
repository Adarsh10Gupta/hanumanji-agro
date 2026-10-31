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

test('enabled new enquiry sends one detailed Resend notification to the configured owner', async () => {
  const sent: Array<{ to: string; idempotencyKey: string; html: string }> = [];
  const recorded: Array<{ status: string; id?: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    recipient: 'owner-controlled@example.com',
    enabled: true,
    send: async (input) => {
      sent.push(input);
      return { status: 'sent', id: 'resend-message-123' };
    },
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner-controlled@example.com');
  assert.equal(sent[0].idempotencyKey, 'enquiry-owner/HA-2026-ABC123');
  assert.match(sent[0].html, /HA-2026-ABC123/);
  assert.match(sent[0].html, /Rahul/);
  assert.match(sent[0].html, /rahul@example\.com/);
  assert.match(sent[0].html, /919876543210/);
  assert.match(sent[0].html, /Mustard Oil — 500 litres/);
  assert.match(sent[0].html, /Kolkata, West Bengal/);
  assert.match(sent[0].html, /Please share pricing\./);
  assert.deepEqual(recorded, [{ status: 'sent', id: 'resend-message-123' }]);
  assert.equal(result.status, 'sent');
  assert.equal(result.id, 'resend-message-123');
  assert.equal(result.recorded, true);
});

test('disabled owner notification preference skips Resend and records disabled status', async () => {
  let sendCount = 0;
  const recorded: Array<{ status: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    recipient: 'owner-controlled@example.com',
    enabled: false,
    send: async () => {
      sendCount += 1;
      return { status: 'sent', id: 'unexpected' };
    },
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(sendCount, 0);
  assert.deepEqual(recorded, [{ status: 'disabled' }]);
  assert.equal(result.status, 'disabled');
  assert.equal(result.recorded, true);
});

test('Resend rejection is recorded as failed without throwing or losing the saved enquiry', async () => {
  const recorded: Array<{ status: string; errorCode?: string }> = [];
  const result = await notifyEnquiryOwner({
    enquiry,
    recipient: 'owner-controlled@example.com',
    enabled: true,
    send: async () => ({ status: 'failed', errorCode: 'provider_rejected', httpStatus: 422 }),
    record: async (outcome) => { recorded.push(outcome); },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'provider_rejected');
  assert.equal(result.recorded, true);
  assert.deepEqual(recorded, [{ status: 'failed', errorCode: 'provider_rejected', httpStatus: 422 }]);
});

test('notification send and recording failures do not throw after enquiry creation', async () => {
  const sendResult = await notifyEnquiryOwner({
    enquiry,
    recipient: 'owner-controlled@example.com',
    enabled: true,
    send: async () => { throw new Error('test-only transport failure'); },
    record: async () => {},
  });
  assert.equal(sendResult.status, 'failed');
  assert.equal(sendResult.errorCode, 'notification_send_error');

  const recordResult = await notifyEnquiryOwner({
    enquiry,
    recipient: 'owner-controlled@example.com',
    enabled: true,
    send: async () => ({ status: 'sent', id: 'resend-message-123' }),
    record: async () => { throw new Error('test-only persistence failure'); },
  });
  assert.equal(recordResult.status, 'sent');
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
  assert.match(route, /process\.env\.OWNER_NOTIFICATION_EMAIL\?\.trim\(\)\s*\|\|\s*settings\?\.notificationEmail/);
  assert.match(route, /settingsAvailable && preferences\.ownerEmail !== false/);
  assert.match(route, /notification\.enquiry_owner/);
  assert.match(route, /providerMessageId:\s*outcome\.id/);
  assert.match(route, /notificationStatus:\s*outcome\.status/);
  assert.match(route, /findOne\(\{ idempotencyKey: keyResult\.data \}\)/);
});
