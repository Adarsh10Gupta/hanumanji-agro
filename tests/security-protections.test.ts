import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { emailDailyBudget, emailQueueCapacity } from '../src/lib/email-budget';
import { sendEmail } from '../src/lib/email';
import { isValidCloudinaryUploadResult, uploadToCloudinary } from '../src/lib/cloudinary-upload';
import { readBoundedBody, readJsonBody, trustedClientIp } from '../src/lib/security';

function request(headers: HeadersInit = {}, body = '') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers,
    body,
  });
}

test('rate limiting accepts only the configured proxy IP and ignores caller-supplied forwarding chains', () => {
  const previous = process.env.TRUSTED_CLIENT_IP_HEADER;
  delete process.env.TRUSTED_CLIENT_IP_HEADER;
  try {
    assert.equal(trustedClientIp(request({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.4' })), '203.0.113.8');
    assert.equal(trustedClientIp(request({ 'x-forwarded-for': '198.51.100.4' })), null);
    assert.equal(trustedClientIp(request()), null);
    assert.equal(trustedClientIp(request({ 'x-real-ip': 'not-an-ip' })), null);
    assert.equal(trustedClientIp(request({ 'x-real-ip': '203.0.113.8, 198.51.100.4' })), null);
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-proxy-client';
    assert.equal(trustedClientIp(request({ 'x-proxy-client': '2001:db8::8', 'x-real-ip': '203.0.113.8' })), '2001:db8::8');
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER = previous;
  }
});

test('request body limits count streamed bytes and validate JSON before parsing', async () => {
  const oversized = await readBoundedBody(request({}, '01234567890'), 10);
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.response.status, 413);

  const parsed = await readJsonBody(request({ 'content-type': 'application/json' }, '{"valid":true}'), 32);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.data, { valid: true });

  const malformed = await readJsonBody(request({ 'content-type': 'application/json' }, '{'), 32);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.response.status, 400);

  const tooLargeByHeader = await readBoundedBody(request({ 'content-length': '20' }, 'short'), 10);
  assert.equal(tooLargeByHeader.ok, false);
  if (!tooLargeByHeader.ok) assert.equal(tooLargeByHeader.response.status, 413);
});

test('Cloudinary results must match the configured account and generated asset identifier', () => {
  const good = {
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/hanumanji-agro/products/id.jpg',
    public_id: 'hanumanji-agro/products/id',
    width: 640,
    height: 480,
    format: 'jpg',
  };
  assert.equal(isValidCloudinaryUploadResult(good, 'demo', 'hanumanji-agro/products/id'), true);
  assert.equal(isValidCloudinaryUploadResult({ ...good, secure_url: 'http://res.cloudinary.com/demo/image/upload/id.jpg' }, 'demo', good.public_id), false);
  assert.equal(isValidCloudinaryUploadResult({ ...good, public_id: 'unexpected' }, 'demo', good.public_id), false);
  assert.equal(isValidCloudinaryUploadResult({ ...good, width: Number.NaN }, 'demo', good.public_id), false);
});

test('email and Cloudinary requests use mocked providers and bounded outbound timeouts', async () => {
  const previous = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    disabled: process.env.DISABLE_EXTERNAL_NOTIFICATIONS,
  };
  const originalFetch = globalThis.fetch;
  try {
    process.env.RESEND_API_KEY = 'test-only-key';
    process.env.EMAIL_FROM = 'test@example.invalid';
    delete process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    let emailRequest: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      emailRequest = init;
      return new Response(JSON.stringify({ id: 'mock-message-id' }), { status: 200 });
    };
    const budgetKeys: string[] = [];
    const delivery = await sendEmail({
      to: 'recipient@example.invalid',
      subject: 'Test',
      html: '<p>Test</p>',
      idempotencyKey: 'test-email-key',
    }, { reserveBudget: async (key) => { budgetKeys.push(key); return true; } });
    assert.deepEqual(delivery, { status: 'sent', id: 'mock-message-id' });
    assert.deepEqual(budgetKeys, ['test-email-key']);
    assert.equal(new Headers(emailRequest?.headers).get('Idempotency-Key'), 'test-email-key');
    assert.ok(emailRequest?.signal instanceof AbortSignal);

    globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    const timedOut = await sendEmail({
      to: 'recipient@example.invalid',
      subject: 'Test',
      html: '<p>Test</p>',
      idempotencyKey: 'test-timeout-key',
    }, { reserveBudget: async () => true });
    assert.deepEqual(timedOut, { status: 'failed', errorCode: 'provider_timeout' });

    let fetchedDespiteBudget = false;
    const exhausted = await sendEmail({
      to: 'recipient@example.invalid',
      subject: 'Test',
      html: '<p>Test</p>',
      idempotencyKey: 'test-budget-key',
    }, {
      reserveBudget: async () => false,
      fetcher: async () => { fetchedDespiteBudget = true; return new Response('{}'); },
    });
    assert.deepEqual(exhausted, { status: 'pending', errorCode: 'daily_email_budget_exceeded' });
    assert.equal(fetchedDespiteBudget, false);

    let uploadRequest: RequestInit | undefined;
    const form = new FormData();
    const response = await uploadToCloudinary('https://api.cloudinary.com/test', form, async (_input, init) => {
      uploadRequest = init;
      return new Response('{}', { status: 200 });
    });
    assert.equal(response.status, 200);
    assert.equal(uploadRequest?.method, 'POST');
    assert.equal(uploadRequest?.body, form);
    assert.ok(uploadRequest?.signal instanceof AbortSignal);
    await assert.rejects(
      uploadToCloudinary('https://api.cloudinary.com/test', form, async () => {
        throw new DOMException('Timed out', 'TimeoutError');
      }),
      /Timed out/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.apiKey;
    if (previous.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previous.from;
    if (previous.disabled === undefined) delete process.env.DISABLE_EXTERNAL_NOTIFICATIONS;
    else process.env.DISABLE_EXTERNAL_NOTIFICATIONS = previous.disabled;
  }
});

test('email budgets and outbox capacity have finite defaults and reject unsafe configuration', () => {
  const daily = process.env.EMAIL_DAILY_BUDGET;
  const pending = process.env.EMAIL_MAX_PENDING;
  try {
    delete process.env.EMAIL_DAILY_BUDGET;
    delete process.env.EMAIL_MAX_PENDING;
    assert.equal(emailDailyBudget(), 100);
    assert.equal(emailQueueCapacity(), 250);
    process.env.EMAIL_DAILY_BUDGET = '0';
    assert.throws(() => emailDailyBudget(), /EMAIL_DAILY_BUDGET/);
    process.env.EMAIL_MAX_PENDING = '10001';
    assert.throws(() => emailQueueCapacity(), /EMAIL_MAX_PENDING/);
  } finally {
    if (daily === undefined) delete process.env.EMAIL_DAILY_BUDGET;
    else process.env.EMAIL_DAILY_BUDGET = daily;
    if (pending === undefined) delete process.env.EMAIL_MAX_PENDING;
    else process.env.EMAIL_MAX_PENDING = pending;
  }
});

test('public submissions enqueue notifications and never create indexes or send email inline', async () => {
  const enquiry = await readFile('src/app/api/enquiries/route.ts', 'utf8');
  const supplier = await readFile('src/app/api/suppliers/route.ts', 'utf8');
  const models = await readFile('src/lib/models.ts', 'utf8');
  const worker = await readFile('scripts/notification-worker.ts', 'utf8');
  assert.doesNotMatch(enquiry, /collection\.createIndex|sendEmail\(/);
  assert.doesNotMatch(supplier, /collection\.createIndex|sendEmail\(/);
  assert.match(models, /EnquirySchema\.index\(\{ idempotencyKey: 1 \}, \{ unique: true, sparse: true \}\)/);
  assert.match(models, /SupplierSchema\.index\(\{ idempotencyKey: 1 \}, \{ unique: true, sparse: true \}\)/);
  assert.match(worker, /processNextEmailNotification/);
  assert.match(worker, /expireStaleEmailNotifications/);
});
