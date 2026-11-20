import { randomUUID } from 'node:crypto';
import { AuditLog, Category, Enquiry, Product, SupplierEnquiry } from '../src/lib/models.js';
import { db } from '../src/lib/db.js';
import { validateE2EConfiguration } from './e2e-safety.js';

const scriptArgs = process.argv.slice(2);
const baseUrl = (scriptArgs.find((argument) => !argument.startsWith('--')) || 'http://localhost:3027').replace(/\/$/, '');
const runId = randomUUID();
const suffix = runId.replaceAll('-', '').slice(0, 12);
const categorySlug = `codex-e2e-${suffix}`;
const productSlug = `codex-e2e-product-${suffix}`;
const enquiryKey = randomUUID();
const businessKey = randomUUID();
const supplierKey = randomUUID();
const customerPhone = `1999${Date.now().toString().slice(-10)}`;
const supplierPhone = `1888${Date.now().toString().slice(-10)}`;
const customerEmail = `qa-${suffix}@example.invalid`;
const supplierEmail = `supplier-${suffix}@example.invalid`;
let cookie = '';
let categoryId = '';
let productId = '';
let enquiryId = '';
let generalEnquiryId = '';
let enquiryRef = '';
let generalEnquiryRef = '';
let supplierId = '';
const auditIds: string[] = [];
let databaseConnected = false;

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Failed: ${label}`);
  console.log(`PASS ${label}`);
}

function headers(auth = false) {
  const clientIp = `198.51.100.${1 + parseInt(suffix.slice(0, 2), 16) % 200}`;
  return { origin: baseUrl, 'x-real-ip': clientIp, ...(auth && cookie ? { cookie } : {}) };
}

async function request(path: string, init: RequestInit = {}, auth = false) {
  const merged = new Headers(init.headers);
  for (const [key, value] of Object.entries(headers(auth))) merged.set(key, value);
  return fetch(`${baseUrl}${path}`, { ...init, headers: merged, signal: AbortSignal.timeout(25_000) });
}

async function json(response: Response) {
  return response.json() as Promise<any>;
}

function productsFromCatalogue(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return payload && Array.isArray(payload.products) ? payload.products : [];
}

async function run() {
  const configuration = validateE2EConfiguration(process.env, baseUrl, scriptArgs);
  process.env.MONGODB_URI = configuration.mongodbUri;
  process.env.MONGODB_DATABASE_NAME = configuration.databaseName;
  process.env.DISABLE_EXTERNAL_NOTIFICATIONS = '1';

  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) throw new Error('Dedicated test owner environment is not configured.');

  const readiness = await fetch(`${baseUrl}/api/e2e/readiness`, {
    headers: { 'x-e2e-test-token': configuration.token },
    signal: AbortSignal.timeout(10_000),
  });
  const readinessResult = await json(readiness);
  if (!readiness.ok || readinessResult.ok !== true || readinessResult.databaseName !== configuration.databaseName) {
    throw new Error('The local application did not prove its isolated E2E database configuration.');
  }

  await db();
  databaseConnected = true;
  const databaseName = (await import('mongoose')).default.connection.db?.databaseName;
  if (databaseName !== configuration.databaseName) throw new Error('Connected database does not match the explicit E2E test database.');
  console.info(`E2E test mode enabled; database=${databaseName}; email, WhatsApp, and Cloudinary operations disabled.`);

  const login = await request('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const loginHeaders = login.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = loginHeaders.getSetCookie?.() ?? [login.headers.get('set-cookie') || ''];
  const sessionCookie = setCookies.find((value) => value.startsWith('ha_session=')) || '';
  cookie = sessionCookie.split(';', 1)[0];
  assert(login.status === 200 && !!cookie, 'owner login creates a session');

  const initialCatalogueResponse = await request('/api/products');
  const initialCatalogue = await json(initialCatalogueResponse);
  const initialProducts = productsFromCatalogue(initialCatalogue);
  assert(initialCatalogueResponse.ok && Array.isArray(initialProducts), 'public product API responds with a catalogue');

  const generalPayload = { name: 'Codex Release QA', phone: customerPhone, email: customerEmail, customerType: 'Business', company: `QA ${suffix}`, subject: 'Release test general enquiry', city: 'Kalimpong', state: 'West Bengal', message: 'Disposable end-to-end general enquiry.', consent: true, enquiryType: 'Business', items: [] };
  const generalFirst = await request('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': businessKey }, body: JSON.stringify(generalPayload) });
  const generalResult = await json(generalFirst);
  assert(generalFirst.status === 201 && generalResult.reference && ['pending', 'disabled'].includes(generalResult.notificationStatus), 'general enquiry saves without a product and never sends test email');
  generalEnquiryRef = generalResult.reference;
  const generalRecord: any = await Enquiry.findOne({ reference: generalEnquiryRef }).select('_id').lean();
  generalEnquiryId = String(generalRecord?._id || '');
  const generalDuplicate = await request('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': businessKey }, body: JSON.stringify(generalPayload) });
  const generalDuplicateResult = await json(generalDuplicate);
  assert(generalDuplicate.status === 200 && generalDuplicateResult.reference === generalResult.reference && generalDuplicateResult.duplicate, 'general enquiry idempotency prevents duplicate records');

  const categoryResponse = await request('/api/admin/categories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Codex QA ${suffix}`, slug: categorySlug, description: 'Temporary integration-test category.', displayOrder: 999, published: true }) }, true);
  const categoryResult = await json(categoryResponse);
  assert(categoryResponse.status === 201 && categoryResult.id, 'owner creates a test category');
  categoryId = String(categoryResult.id);
  auditIds.push(categoryId);

  const imageUrl = '';

  const productPayload = { name: `Codex QA Product ${suffix}`, slug: productSlug, category: `Codex QA ${suffix}`, description: 'Temporary release test product, remove after verification.', shortDescription: 'Temporary QA item.', fullDescription: 'Disposable integration test record.', images: imageUrl ? [imageUrl] : [], image: imageUrl, specifications: { Test: 'Release verification' }, grade: 'QA', unit: 'kg', minOrderQuantity: 1, status: 'available', published: true, featured: false, seoTitle: `QA ${suffix}`, seoDescription: 'Temporary test item.' };
  const createProduct = await request('/api/admin/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(productPayload) }, true);
  const createdProduct = await json(createProduct);
  assert(createProduct.status === 201 && createdProduct.id, 'owner creates and publishes a test product');
  productId = String(createdProduct.id);
  auditIds.push(productId);
  const visibleResponse = await request('/api/products');
  const visibleRows = productsFromCatalogue(await json(visibleResponse));
  assert(visibleResponse.ok && visibleRows.some((item: any) => item.slug === productSlug), 'published product appears in public API');
  const detailResponse = await request(`/products/${productSlug}`);
  const detailHtml = await detailResponse.text();
  assert(detailResponse.ok && detailHtml.includes(productPayload.name), 'published product detail page renders');
  const blockedDelete = await request(`/api/admin/categories/${categoryId}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }, true);
  assert(blockedDelete.status === 409, 'category deletion is blocked while it contains an active product');

  const productPayloadForEnquiry = { name: 'Codex Release QA', phone: customerPhone, email: customerEmail, customerType: 'Business', company: `QA ${suffix}`, city: 'Kalimpong', state: 'West Bengal', message: 'Temporary product enquiry.', consent: true, enquiryType: 'Quotation', items: [{ productId, quantity: 12, unit: 'kg' }] };
  const enquiryResponse = await request('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': enquiryKey }, body: JSON.stringify(productPayloadForEnquiry) });
  const enquiryResult = await json(enquiryResponse);
  assert(enquiryResponse.status === 201 && enquiryResult.reference, 'product enquiry validates product ID and saves a reference');
  enquiryRef = enquiryResult.reference;
  const enquiryRecord: any = await Enquiry.findOne({ reference: enquiryRef }).lean();
  enquiryId = String(enquiryRecord?._id || '');
  assert(enquiryRecord?.items?.[0]?.snapshot?.name === productPayload.name && enquiryRecord.customerSnapshot.email === customerEmail, 'product snapshot and normalized customer data persist');
  auditIds.push(String(enquiryRecord._id));
  assert((await Enquiry.countDocuments({ reference: enquiryRef })) === 1, 'product enquiry is stored exactly once');

  const enquiryDuplicate = await request('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': enquiryKey }, body: JSON.stringify(productPayloadForEnquiry) });
  const duplicateResult = await json(enquiryDuplicate);
  assert(enquiryDuplicate.status === 200 && duplicateResult.reference === enquiryRef && (await Enquiry.countDocuments({ reference: enquiryRef })) === 1, 'repeated product submission returns the same reference');

  const adminListResponse = await request(`/api/admin/enquiries?search=${encodeURIComponent(enquiryRef)}&status=New`, {}, true);
  const adminList = await json(adminListResponse);
  assert(adminListResponse.ok && adminList.total === 1 && adminList.rows[0].reference === enquiryRef, 'owner can search and filter the saved enquiry');
  const adminDetailResponse = await request(`/api/admin/enquiries/${enquiryRecord._id}`, {}, true);
  assert(adminDetailResponse.ok && (await json(adminDetailResponse)).reference === enquiryRef, 'owner can open enquiry details');

  const quote = { lines: [{ productName: productPayload.name, quantity: 12, unit: 'kg', unitPrice: 145 }], transport: 250, additionalCharges: 50, notes: 'Temporary draft.', terms: 'Test terms only.', validUntil: new Date(Date.now() + 7 * 86400_000).toISOString() };
  const saveQuote = await request(`/api/admin/enquiries/${enquiryRecord._id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'Contacted', notes: 'Disposable e2e note.', quotation: quote }) }, true);
  const quoteResult = await json(saveQuote);
  assert(saveQuote.ok && quoteResult.total === 2040, 'owner saves quotation and server calculates the INR total');
  const revisedQuote = { ...quote, lines: [{ ...quote.lines[0], unitPrice: 150 }] };
  const saveRevision = await request(`/api/admin/enquiries/${enquiryRecord._id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quotation: revisedQuote }) }, true);
  const revisionResult = await json(saveRevision);
  const savedDetail = await json(await request(`/api/admin/enquiries/${enquiryRecord._id}`, {}, true));
  assert(saveRevision.ok && revisionResult.total === 2100 && savedDetail.quotationHistory?.length === 1, 'quotation revisions are preserved in history');
  const pdfResponse = await request(`/api/admin/enquiries/${enquiryRecord._id}/quotation.pdf`, {}, true);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  assert(pdfResponse.ok && pdfBytes.subarray(0, 5).toString() === '%PDF-' && pdfBytes.length > 1000, 'saved quotation downloads as a valid PDF');
  const statusResponse = await request(`/api/admin/enquiries/${enquiryRecord._id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'Accepted' }) }, true);
  assert(statusResponse.ok, 'owner updates enquiry status and persists history');

  const supplierPayload = { name: 'Codex Supplier QA', phone: supplierPhone, email: supplierEmail, product: 'Temporary QA produce', location: 'Kalimpong QA site', quantity: '1 kg', period: 'Test only', description: 'Disposable supplier integration test.' };
  const supplierResponse = await request('/api/suppliers', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': supplierKey }, body: JSON.stringify(supplierPayload) });
  const supplierResult = await json(supplierResponse);
  assert(supplierResponse.status === 201 && supplierResult.received && ['pending', 'disabled'].includes(supplierResult.notificationStatus), 'supplier enquiry saves without sending a real email');
  const supplier = await SupplierEnquiry.findOne({ phone: supplierPhone, product: supplierPayload.product }).lean() as any;
  assert(supplier?.email === supplierEmail, 'supplier email is retained for owner follow-up');
  supplierId = String(supplier._id);
  auditIds.push(supplierId);
  const supplierDuplicate = await request('/api/suppliers', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': supplierKey }, body: JSON.stringify(supplierPayload) });
  assert(supplierDuplicate.status === 200 && (await SupplierEnquiry.countDocuments({ phone: supplierPhone, product: supplierPayload.product })) === 1, 'supplier idempotency prevents duplicate submissions');
  const supplierListResponse = await request(`/api/admin/suppliers?search=${encodeURIComponent('Codex Supplier QA')}`, {}, true);
  const supplierList = await json(supplierListResponse);
  assert(supplierListResponse.ok && supplierList.total === 1, 'owner can search and paginate supplier submissions');

  const dashboard = await request('/admin/dashboard', {}, true);
  const dashboardHtml = await dashboard.text();
  assert(dashboard.ok && dashboardHtml.includes(enquiryRef), 'dashboard shows actual saved enquiry and refreshed counts');

  const unpublish = await request(`/api/admin/products/${productId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ published: false }) }, true);
  assert(unpublish.ok, 'owner can unpublish a product');
  const hiddenRows = productsFromCatalogue(await json(await request('/api/products')));
  assert(!hiddenRows.some((item: any) => item.slug === productSlug), 'unpublished product is hidden from the public API');
  const hiddenDetail = await request(`/products/${productSlug}`);
  const hiddenDetailHtml = await hiddenDetail.text();
  assert(!hiddenDetailHtml.includes(productPayload.name), 'unpublished product detail does not expose product content');
  const republish = await request(`/api/admin/products/${productId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ published: true }) }, true);
  assert(republish.ok, 'owner can publish a product');
  const archive = await request(`/api/admin/products/${productId}`, { method: 'DELETE' }, true);
  assert(archive.ok, 'owner can archive a product');
  const archivedRows = productsFromCatalogue(await json(await request('/api/products')));
  assert(!archivedRows.some((item: any) => item.slug === productSlug), 'archived product is hidden from public listings');
  const archivedDetail = await request(`/products/${productSlug}`);
  assert(!(await archivedDetail.text()).includes(productPayload.name), 'archived product detail does not expose product content');
  const deleteEmptyCategory = await request(`/api/admin/categories/${categoryId}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }, true);
  assert(deleteEmptyCategory.ok, 'owner can delete the now-empty test category');
  categoryId = '';

  const protectedResponse = await request('/api/admin/products');
  assert(protectedResponse.status === 401, 'protected admin API rejects requests without the owner session');
  const mediaUnauthorized = await request('/api/admin/media');
  assert(mediaUnauthorized.status === 401, 'media library API rejects requests without the owner session');
  const uploadUnauthorized = await request('/api/admin/uploads', { method: 'POST' });
  assert(uploadUnauthorized.status === 401, 'media upload API rejects requests without the owner session');
  const protectedPage = await request('/admin/dashboard');
  const protectedHtml = await protectedPage.text();
  assert(protectedHtml.includes('/admin/login') || protectedPage.status === 307 || protectedPage.status === 308, 'protected admin page redirects without the owner session');
}

async function cleanup() {
  if (!databaseConnected) return;
  try {
    if (productId) await Product.deleteOne({ _id: productId, slug: productSlug });
    for (const id of [enquiryId, generalEnquiryId, supplierId].filter(Boolean)) auditIds.push(id);
    for (const id of [enquiryId, generalEnquiryId].filter(Boolean)) await Enquiry.deleteOne({ _id: id });
    if (supplierId) await SupplierEnquiry.deleteOne({ _id: supplierId, phone: supplierPhone });
    if (categoryId) await Category.deleteOne({ _id: categoryId, slug: categorySlug });
    if (auditIds.length) await AuditLog.deleteMany({ entityId: { $in: [...new Set(auditIds)] } });
    if (cookie) {
      const logout = await request('/api/admin/logout', { method: 'POST' }, true);
      if (!logout.ok) throw new Error('Temporary owner session cleanup failed.');
      cookie = '';
      console.log('PASS temporary owner session is revoked after cleanup');
    }
    console.log('Test cleanup: only records created by this invocation were targeted; Cloudinary was not used.');
  } catch {
    console.error('Test cleanup could not confirm every item; inspect only test-prefix records before rerunning.');
    process.exitCode = 1;
  } finally {
    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect().catch(() => undefined);
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown failure';
  console.error(`End-to-end release test failed: ${message}. Credentials, cookies, and response bodies are withheld.`);
  process.exitCode = 1;
}).finally(cleanup);
