import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('environment template contains placeholders and private env files are ignored', async () => {
  const template = await readFile('.env.example', 'utf8');
  const ignore = await readFile('.gitignore', 'utf8');
  assert.match(template, /^MONGODB_URI=mongodb\+srv:\/\/\<username\>:/m);
  assert.match(template, /^SESSION_SECRET=\<generate-/m);
  assert.match(template, /^ADMIN_BOOTSTRAP_PASSWORD=\<unique-/m);
  assert.match(template, /^ADMIN_BOOTSTRAP_EMAIL=\<owner-email\>$/m);
  assert.match(template, /^RESEND_API_KEY=\<resend-api-key\>$/m);
  assert.match(template, /^OWNER_NOTIFICATION_EMAIL=\<owner-notification-email\>$/m);
  assert.doesNotMatch(template, /hanumanjiagro@gmail\.com/i);
  assert.match(ignore, /^\.env\.\*/m);
  assert.match(ignore, /^!\.env\.example$/m);
});

test('Resend integration test action is owner-only and pins its recipient, sender and subject', async () => {
  const route = await readFile('src/app/api/admin/email-test/route.ts', 'utf8');
  const email = await readFile('src/lib/email.ts', 'utf8');
  const settings = await readFile('src/components/admin/SettingsForm.tsx', 'utf8');
  assert.match(route, /const admin = await owner\(\)/);
  assert.match(route, /OWNER_NOTIFICATION_EMAIL/);
  assert.match(route, /Hanumanji Agro <onboarding@resend\.dev>/);
  assert.match(route, /Hanumanji Agro — Email Integration Test/);
  assert.match(route, /providerMessageId: delivery\.id/);
  assert.match(route, /sameOrigin\(req\)/);
  assert.match(email, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(email, /input\.from \|\| process\.env\.EMAIL_FROM/);
  assert.match(settings, /\/api\/admin\/email-test/);
  assert.doesNotMatch(route, /console\.(?:log|error).*RESEND_API_KEY/);
});

test('application database helper is pinned to Hanumanji Agro and has bounded pooling', async () => {
  const source = await readFile('src/lib/db.ts', 'utf8');
  assert.match(source, /dbName:\s*'hanumanji_agro'/);
  assert.match(source, /maxPoolSize:\s*10/);
  assert.match(source, /global\.mongooseCache/);
});

test('owner bootstrap enforces the unique single-owner marker and never resets an existing password', async () => {
  const source = await readFile('scripts/bootstrap-owner.ts', 'utf8');
  assert.match(source, /createIndex\(\{ ownerKey: 1 \}, \{ unique: true \}\)/);
  assert.match(source, /ownerKey: 'primary'/);
  assert.match(source, /existing\.length > 1/);
  assert.doesNotMatch(source, /passwordHash\s*=.*existing/);
});

test('owner login trims and normalizes email before lookup and verifies Argon2 credentials', async () => {
  const source = await readFile('src/app/api/admin/login/route.ts', 'utf8');
  assert.match(source, /email:\s*z\.string\(\)\.trim\(\)\.email\(\)/);
  assert.match(source, /email:\s*parsed\.data\.email\.toLowerCase\(\)/);
  assert.match(source, /argon2\.verify\(admin\.passwordHash, parsed\.data\.password\)/);
  assert.match(source, /ownerKey:\s*'primary'.*active:\s*true/);
});
