import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SiteSettings } from '../src/lib/models';
import {
  DEFAULT_BUSINESS_WHATSAPP,
  buildWhatsAppReplyMessage,
  buildWhatsAppUrl,
  formatWhatsAppNumber,
  normalizeWhatsAppNumber,
} from '../src/lib/whatsapp-number';

test('new website settings default to the requested business WhatsApp number', () => {
  assert.equal(new SiteSettings({ key: 'main' }).whatsapp, DEFAULT_BUSINESS_WHATSAPP);
  assert.equal(DEFAULT_BUSINESS_WHATSAPP, '+91 9876543210');
});

test('WhatsApp setting updates only change the WhatsApp field and remain owner-only', async () => {
  const route = await readFile('src/app/api/admin/settings/route.ts', 'utf8');
  const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function PUT'));
  assert.match(patch, /const admin = await owner\(\)/);
  assert.match(patch, /\$set:\s*\{\s*whatsapp\s*\}/);
  assert.match(patch, /audit\(admin\._id, 'settings\.update'.*field: 'whatsapp'/);
});

test('legacy settings receive a default only when their WhatsApp value is blank', async () => {
  const route = await readFile('src/app/api/admin/settings/route.ts', 'utf8');
  assert.match(route, /if \(!String\(settings\.whatsapp \|\| ''\)\.trim\(\)\)/);
  assert.match(route, /whatsapp: DEFAULT_BUSINESS_WHATSAPP/);
  assert.match(route, /\{ whatsapp: \{ \$exists: false \} \}/);
});

test('customer phone normalization handles Indian local and international numbers and rejects malformed values', () => {
  assert.equal(normalizeWhatsAppNumber('98765 43210'), '919876543210');
  assert.equal(normalizeWhatsAppNumber('+91 (98765) 43210'), '919876543210');
  assert.equal(normalizeWhatsAppNumber('0044 20 7946 0958'), '442079460958');
  assert.equal(normalizeWhatsAppNumber('0012345678'), '12345678');
  assert.equal(normalizeWhatsAppNumber('call-me-at-123'), null);
  assert.equal(normalizeWhatsAppNumber('0000000000'), null);
  assert.equal(formatWhatsAppNumber('9876543210'), '+91 9876543210');
});

test('WhatsApp reply URLs target the customer and safely encode editable messages', () => {
  const message = 'Hello Rahul,\nThank you! 500 litres of Mustard Oil for Kolkata.';
  const url = buildWhatsAppUrl('+91 98765 43210', message);
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://wa.me');
  assert.equal(parsed.pathname, '/919876543210');
  assert.equal(parsed.searchParams.get('text'), message);
  assert.equal(buildWhatsAppUrl('not a phone', message), null);
});

test('reply draft includes available enquiry details and original customer message', () => {
  const message = buildWhatsAppReplyMessage({
    reference: 'HA-2026-ABC123',
    customerSnapshot: { name: 'Rahul', type: 'Business' },
    items: [{ quantity: 500, unit: 'litres', snapshot: { name: 'Mustard Oil', grade: 'A' } }],
    destination: { city: 'Kolkata', state: 'West Bengal' },
    message: 'Please share wholesale pricing.',
  });
  assert.match(message, /Hello Rahul,/);
  assert.match(message, /HA-2026-ABC123/);
  assert.match(message, /500 litres of Mustard Oil, grade A for business supply/);
  assert.match(message, /Kolkata, West Bengal/);
  assert.match(message, /Your message: Please share wholesale pricing\./);
});

test('enquiry contact tracking uses the existing owner-authenticated status and audit flow', async () => {
  const route = await readFile('src/app/api/admin/enquiries/[id]/route.ts', 'utf8');
  assert.match(route, /export async function PATCH[\s\S]*?const admin = await owner\(\)/);
  assert.match(route, /enquiry\.statusHistory\.push\(\{ status: data\.status, at: new Date\(\), actor: admin\._id \}\)/);
  assert.match(route, /audit\(admin\._id, 'enquiry\.update'/);
});
