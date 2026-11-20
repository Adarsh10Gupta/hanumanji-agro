import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  dailyBudgetBucket,
  nextUtcDay,
  reconcileQueueReservations,
  reserveBudgetReservation,
  reserveQueueReservation,
  type QueueReservation,
  type QueueReservationStore,
} from '../src/lib/email-budget';
import { commitLeasedNotification, shouldRetryEmail } from '../src/lib/email-outbox';
import { indexMatches, type IndexDefinition } from '../src/lib/index-verification';
import { pageCount, pageSlice, PUBLIC_PRODUCT_PAGE_SIZE } from '../src/lib/catalog-pagination';
import { addEnquirySelection, MAX_ENQUIRY_PRODUCTS, normalizeEnquirySelection } from '../src/lib/enquiry-selection';
import { validateE2EConfiguration } from '../scripts/e2e-safety';
import { enqueueOrderStatusNotification, orderStatusNotificationAllowed } from '../src/lib/order-status-notifications';

function memoryQueue(initial: QueueReservation[] = []): QueueReservationStore & { values: QueueReservation[] } {
  const values = initial.map((reservation) => ({ ...reservation }));
  return {
    values,
    async refresh(key, reservedAt) {
      const reservation = values.find((entry) => entry.key === key);
      if (!reservation) return false;
      reservation.reservedAt = reservedAt;
      return true;
    },
    async reserveIfRoom(key, reservedAt, limit) {
      if (values.some((entry) => entry.key === key)) return true;
      if (values.length >= limit) return false;
      values.push({ key, reservedAt });
      return true;
    },
    async list() {
      return values.map((entry) => ({ ...entry }));
    },
    async removeStale(keys, cutoff) {
      for (let index = values.length - 1; index >= 0; index -= 1) {
        if (keys.includes(values[index].key) && values[index].reservedAt < cutoff) values.splice(index, 1);
      }
    },
    async ensureActive(key, reservedAt) {
      const reservation = values.find((entry) => entry.key === key);
      if (reservation) reservation.reservedAt = reservedAt;
      else values.push({ key, reservedAt });
    },
  };
}

test('index verification checks index name, ordered keys, and all relevant options', () => {
  const expected: IndexDefinition = {
    name: 'idempotencyKey_1',
    key: { idempotencyKey: 1 },
    options: { unique: true, sparse: true, expireAfterSeconds: 0, partialFilterExpression: { active: true } },
  };
  assert.equal(indexMatches(expected, expected), true);
  assert.equal(indexMatches({ ...expected, name: 'other_name' }, expected), false);
  assert.equal(indexMatches({ ...expected, key: { other: 1 } }, expected), false);
  assert.equal(indexMatches({ ...expected, key: { second: 1, idempotencyKey: 1 } }, expected), false);
  assert.equal(indexMatches({ ...expected, options: { unique: false, sparse: true, expireAfterSeconds: 0, partialFilterExpression: { active: true } } }, expected), false);
  assert.equal(indexMatches({ ...expected, options: { unique: true, sparse: false, expireAfterSeconds: 0, partialFilterExpression: { active: true } } }, expected), false);
  assert.equal(indexMatches({ ...expected, options: { unique: true, sparse: true, expireAfterSeconds: 10, partialFilterExpression: { active: true } } }, expected), false);
  assert.equal(indexMatches({ ...expected, options: { unique: true, sparse: true, expireAfterSeconds: 0, partialFilterExpression: { active: false } } }, expected), false);
});

test('expired worker lease cannot update an entity after another worker takes over', async () => {
  let currentLease = 'worker-two';
  let entityStatus = 'pending';
  const committed = await commitLeasedNotification({
    transition: async () => {
      if (currentLease !== 'worker-one') return false;
      currentLease = '';
      return true;
    },
    updateEntity: async () => { entityStatus = 'sent'; },
  });
  assert.equal(committed, false);
  assert.equal(entityStatus, 'pending');
});

test('concurrent queue reservations never exceed the configured capacity', async () => {
  const store = memoryQueue();
  const results = await Promise.all(
    Array.from({ length: 40 }, (_, index) => reserveQueueReservation(store, `key-${index}`, 7)),
  );
  assert.equal(results.filter(Boolean).length, 7);
  assert.equal(store.values.length, 7);
});

test('reconciliation preserves concurrent fresh reservations and repairs active jobs', async () => {
  const now = new Date('2026-11-05T10:00:00Z');
  const store = memoryQueue([{ key: 'orphan', reservedAt: new Date(now.getTime() - 10 * 60_000) }]);
  const originalList = store.list.bind(store);
  let releaseSnapshot!: () => void;
  const snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
  store.list = async () => {
    const snapshot = await originalList();
    await snapshotGate;
    return snapshot;
  };

  const reconcile = reconcileQueueReservations(store, ['active-job'], now, 5 * 60_000);
  const concurrentReservation = reserveQueueReservation(store, 'concurrent-job', 2, now);
  releaseSnapshot();
  await Promise.all([reconcile, concurrentReservation]);

  assert.deepEqual(new Set(store.values.map((entry) => entry.key)), new Set(['active-job', 'concurrent-job']));
});

test('stale orphan cleanup does not remove a reservation refreshed after its snapshot', async () => {
  const now = new Date('2026-11-05T10:00:00Z');
  const store = memoryQueue([{ key: 'reused-key', reservedAt: new Date(now.getTime() - 10 * 60_000) }]);
  const remove = store.removeStale.bind(store);
  let releaseCleanup!: () => void;
  const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
  store.removeStale = async (keys, cutoff) => {
    await cleanupGate;
    await remove(keys, cutoff);
  };
  const reconciliation = reconcileQueueReservations(store, [], now, 5 * 60_000);
  await reserveQueueReservation(store, 'reused-key', 1, now);
  releaseCleanup();
  await reconciliation;
  assert.deepEqual(store.values.map((entry) => entry.key), ['reused-key']);
  assert.equal(store.values[0].reservedAt.getTime(), now.getTime());
});

test('daily budget is reserved per delivery UTC day and concurrent sends stay within cap', async () => {
  const reservations = new Map<string, Set<string>>();
  const store = {
    async reserve(key: string, limit: number) {
      const day = key.slice(0, 10);
      const idempotencyKey = key.slice(11);
      const used = reservations.get(day) || new Set<string>();
      if (used.has(idempotencyKey)) return true;
      if (used.size >= limit) return false;
      used.add(idempotencyKey);
      reservations.set(day, used);
      return true;
    },
  };
  const now = new Date('2026-11-05T23:59:59Z');
  const beforeMidnight = dailyBudgetBucket(now);
  const afterMidnight = dailyBudgetBucket(nextUtcDay(now));
  assert.equal(beforeMidnight, '2026-11-05');
  assert.equal(afterMidnight, '2026-11-06');

  const sameDay = await Promise.all(
    Array.from({ length: 25 }, (_, index) => reserveBudgetReservation(store, `${beforeMidnight}/${index}`, 4)),
  );
  assert.equal(sameDay.filter(Boolean).length, 4);
  assert.equal(await reserveBudgetReservation(store, `${beforeMidnight}/0`, 4), true);
  assert.equal(await reserveBudgetReservation(store, `${afterMidnight}/late-queued-job`, 4), true);

  const emailSource = await readFile('src/lib/email.ts', 'utf8');
  const workerSource = await readFile('src/lib/email-outbox.ts', 'utf8');
  assert.match(emailSource, /reserveDailyEmail/);
  assert.match(workerSource, /nextUtcDay\(completedAt\)/);
  assert.match(workerSource, /\$inc:\s*\{\s*attempts:\s*-1\s*\}/);
});

test('product pagination covers every record beyond 500 without overlap', () => {
  const products = Array.from({ length: 1205 }, (_, index) => `product-${index + 1}`);
  const totalPages = pageCount(products.length, PUBLIC_PRODUCT_PAGE_SIZE);
  const pages = Array.from({ length: totalPages }, (_, index) => pageSlice(products, index + 1, PUBLIC_PRODUCT_PAGE_SIZE));
  const flattened = pages.flat();
  assert.equal(totalPages, 26);
  assert.equal(flattened.length, products.length);
  assert.deepEqual(flattened, products);
  assert.equal(pages[0][0], 'product-1');
  assert.equal(pages[1][0], `product-${PUBLIC_PRODUCT_PAGE_SIZE + 1}`);
  assert.equal(pages.at(-1)?.length, 5);
});

test('enquiry selection caps distinct products while preserving duplicate and quantity behavior', () => {
  const products = Array.from({ length: 31 }, (_, index) => ({
    product: { slug: `product-${index + 1}` },
    quantity: 1,
    unit: 'kg',
  }));
  const first29 = products.slice(0, 29);
  const at29 = addEnquirySelection(first29, products[29]);
  assert.equal(at29.lines.length, 30);
  assert.equal(at29.limited, false);
  const at30 = addEnquirySelection(at29.lines, products[30]);
  assert.equal(at30.lines.length, 30);
  assert.equal(at30.limited, true);
  const duplicate = addEnquirySelection(at29.lines, { ...products[0], quantity: 4 });
  assert.equal(duplicate.limited, false);
  assert.equal(duplicate.lines.length, 30);
  const quantityChange = addEnquirySelection(at29.lines, { ...products[0], quantity: 2 }, true);
  assert.equal(quantityChange.lines[0].quantity, 3);
  const legacyDuplicates = normalizeEnquirySelection([products[0], { ...products[0], quantity: 2 }]);
  assert.equal(legacyDuplicates.length, 1);
  assert.equal(legacyDuplicates[0].quantity, 3);
  assert.equal(MAX_ENQUIRY_PRODUCTS, 30);
});

test('release E2E configuration requires explicit isolated test-only configuration', () => {
  const env = {
    E2E_TEST_MODE: '1',
    E2E_TEST_DATABASE_NAME: 'hanumanji_agro_e2e',
    E2E_TEST_MONGODB_URI: 'mongodb://localhost:27017/hanumanji_agro_e2e',
    E2E_TEST_TOKEN: 'e2e-test-token-that-is-at-least-32-chars',
    DISABLE_EXTERNAL_NOTIFICATIONS: '1',
    E2E_DISABLE_WHATSAPP: '1',
    ADMIN_BOOTSTRAP_EMAIL: 'owner@example.invalid',
    ADMIN_BOOTSTRAP_PASSWORD: 'test-only-password',
  };
  const config = validateE2EConfiguration(env, 'http://localhost:3027', ['--test-mode']);
  assert.equal(config.databaseName, 'hanumanji_agro_e2e');
  for (const unsafe of [
    () => validateE2EConfiguration(env, 'https://example.com', ['--test-mode']),
    () => validateE2EConfiguration({ ...env, E2E_TEST_DATABASE_NAME: 'hanumanji_agro' }, 'http://localhost:3027', ['--test-mode']),
    () => validateE2EConfiguration({ ...env, E2E_TEST_MONGODB_URI: 'mongodb+srv://cluster.example/hanumanji_agro_e2e' }, 'http://localhost:3027', ['--test-mode']),
    () => validateE2EConfiguration({ ...env, NODE_ENV: 'production' }, 'http://localhost:3027', ['--test-mode']),
    () => validateE2EConfiguration({ ...env, E2E_DISABLE_WHATSAPP: undefined }, 'http://localhost:3027', ['--test-mode']),
    () => validateE2EConfiguration({ ...env, MONGODB_URI: 'mongodb://production.example/hanumanji_agro' }, 'http://localhost:3027', ['--test-mode']),
  ]) assert.throws(unsafe);
  assert.throws(() => validateE2EConfiguration(env, 'http://localhost:3027', []));
});

test('status updates enqueue durable notifications and category management uses bounded pages', async () => {
  const statusRoute = await readFile('src/app/api/admin/enquiries/[id]/route.ts', 'utf8');
  const worker = await readFile('src/lib/email-outbox.ts', 'utf8');
  const categoryApi = await readFile('src/app/api/admin/categories/route.ts', 'utf8');
  const categoryPage = await readFile('src/app/admin/categories/page.tsx', 'utf8');
  const categoryManager = await readFile('src/components/admin/CategoryManager.tsx', 'utf8');
  const readiness = await readFile('src/app/api/e2e/readiness/route.ts', 'utf8');
  const statusNotifications = await readFile('src/lib/order-status-notifications.ts', 'utf8');
  assert.match(statusRoute, /enqueueEmailNotification/);
  assert.match(statusRoute, /kind:\s*'enquiry-status'/);
  assert.doesNotMatch(statusRoute, /sendEmail\(/);
  assert.match(worker, /orderStatus/);
  assert.match(worker, /statusEventId/);
  assert.match(worker, /contactConsent/);
  assert.match(worker, /MAX_ATTEMPTS = 3/);
  assert.match(worker, /daily_email_budget_exceeded/);
  assert.match(worker, /attempts:\s*-1/);
  assert.match(statusRoute, /enqueueOrderStatusNotification/);
  assert.match(statusNotifications, /catch\s*\{\s*return 'failed'/);
  assert.match(categoryApi, /\.limit\(PAGE_SIZE\)/);
  assert.match(categoryApi, /skip\(\(requested - 1\) \* PAGE_SIZE\)/);
  assert.match(categoryApi, /escapeRegex\(search\)/);
  assert.match(categoryPage, /\.limit\(PAGE_SIZE\)/);
  assert.match(categoryManager, /\/api\/admin\/categories\?page=/);
  assert.match(categoryManager, /searchCategoryOptions/);
  assert.doesNotMatch(categoryManager, /allRows|loadAll/);
  const productForm = await readFile('src/components/admin/ProductForm.tsx', 'utf8');
  assert.match(productForm, /search=\$\{encodeURIComponent\(categoryQuery\)\}/);
  assert.doesNotMatch(productForm, /while \(page <= pages\)/);
  assert.match(categoryManager, /aria-label="Category pages"/);
  assert.match(readiness, /timingSafeEqual/);
  assert.match(readiness, /await db\(\)/);
  assert.match(readiness, /localHosts\.has\(parsedUri\.hostname\)/);
});

test('order-status notifications honor consent, record queue failures honestly, and retry only transient delivery errors', async () => {
  assert.equal(orderStatusNotificationAllowed({ contactConsent: true, preference: true, recipient: 'buyer@example.invalid' }), true);
  assert.equal(orderStatusNotificationAllowed({ contactConsent: false, preference: true, recipient: 'buyer@example.invalid' }), false);
  assert.equal(orderStatusNotificationAllowed({ contactConsent: true, preference: false, recipient: 'buyer@example.invalid' }), false);
  assert.equal(orderStatusNotificationAllowed({ contactConsent: true, preference: true, recipient: '' }), false);

  const job = {
    key: 'status/test/event',
    kind: 'enquiry-status' as const,
    to: 'buyer@example.invalid',
    subject: 'Status changed',
    html: '<p>Updated</p>',
    entityType: 'Enquiry' as const,
    entityId: 'test-enquiry',
    statusField: 'notificationStatus' as const,
    idField: 'notificationId' as const,
    statusEventId: 'event',
  };
  assert.equal(await enqueueOrderStatusNotification(job, async () => { throw new Error('queue unavailable'); }), 'failed');
  assert.equal(await enqueueOrderStatusNotification(job, async () => ({ status: 'pending', queued: true })), 'pending');
  assert.equal(shouldRetryEmail('network_error', undefined, 1), true);
  assert.equal(shouldRetryEmail('provider_timeout', undefined, 3), false);
  assert.equal(shouldRetryEmail('invalid_recipient', 400, 1), false);
});

test('category pages remain bounded while exposing entries beyond the former 500-record limit', () => {
  const categories = Array.from({ length: 1205 }, (_, index) => `category-${index + 1}`);
  const limit = 100;
  const pageSix = pageSlice(categories, 6, limit);
  assert.equal(pageCount(categories.length, limit), 13);
  assert.equal(pageSix[0], 'category-501');
  assert.equal(pageSix.length, 100);
});

test('catalogue and sitemap use pagination/keyset batches rather than a 500-record ceiling', async () => {
  const publicPage = await readFile('src/app/products/page.tsx', 'utf8');
  const api = await readFile('src/app/api/products/route.ts', 'utf8');
  const homepage = await readFile('src/app/page.tsx', 'utf8');
  const sitemap = await readFile('src/app/sitemap.ts', 'utf8');
  const adminPage = await readFile('src/app/admin/products/page.tsx', 'utf8');
  const emailBudget = await readFile('src/lib/email-budget.ts', 'utf8');
  assert.match(publicPage, /\.skip\(\(page - 1\) \* PUBLIC_PRODUCT_PAGE_SIZE\)/);
  assert.match(api, /pageCount\(total, requestedLimit\)/);
  assert.match(homepage, /\.limit\(12\)/);
  assert.match(sitemap, /while \(true\)/);
  assert.match(sitemap, /lastId/);
  assert.match(adminPage, /\.skip\(\(page - 1\) \* ADMIN_PRODUCT_PAGE_SIZE\)/);
  assert.match(emailBudget, /\$expr:\s*\{\s*\$lt:/);
  assert.match(emailBudget, /reservations:\s*\{\s*key:\s*\{\s*\$in:\s*keys\s*\},\s*reservedAt:\s*\{\s*\$lt:\s*cutoff/);
  assert.doesNotMatch(emailBudget, /\$set:\s*\{\s*keys:\s*activeKeys/);
});

test('IP extraction rejects absent and malformed trusted values and ignores spoofed forwarding chains', async () => {
  const deployment = await readFile('DEPLOYMENT.md', 'utf8');
  assert.match(deployment, /Vercel/i);
  assert.match(deployment, /repository does not establish which client-IP headers Vercel sets/i);
  assert.match(deployment, /loopback|private network/i);
  const security = await readFile('src/lib/security.ts', 'utf8');
  assert.match(security, /req\.headers\.get\(header\)/);
  assert.doesNotMatch(security, /headers\.get\('x-forwarded-for'\)/);
});
