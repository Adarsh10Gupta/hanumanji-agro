# Hanumanji Agro build status

Last updated: 2026-10-31

## Public website

- [x] Approved public site composition is preserved; changes focus on data correctness and functional behavior.
- [x] Public product API and detail pages expose only published products in published categories; unpublished and archived products are filtered.
- [x] Empty catalogue and database failure states are visible. The home page no longer substitutes starter products when the database is empty or unavailable.
- [x] Product enquiry snapshots are resolved from MongoDB; general enquiries work with no product catalogue.
- [x] Business settings provide public contact details through a safe allow-list API.
- [ ] Catalogue is empty in the connected database; owner must add approved products/categories before public product sales enquiries can be tested with real catalogue data.

## Owner administration

- [x] A single active owner exists in `hanumanji_agro`; unique owner key and email indexes are present. No owner was created or modified during release verification.
- [x] Session authentication uses opaque random tokens, hashed at rest, HTTP-only cookies, expiry and logout revocation.
- [x] Owner-only dashboard, product/category management, enquiries/quotations, suppliers, customers, settings and media interfaces are implemented.
- [x] Enquiry and supplier lists support search/filter/pagination; CSV export escapes spreadsheet formula prefixes.
- [x] Quotation totals are server-calculated; revisions are kept, a PDF can be downloaded, and send state follows provider acceptance.
- [x] Public submissions normalize and validate contact data, persist consent, and use idempotency keys. Notification failures do not discard submissions.
- [x] Owner retry controls exist for failed/pending notification records.
- [ ] The live database catalogue and enquiry collections were empty before disposable testing. No customer data was available for a live-data workflow check.

## Integrations and release constraints

- [x] MongoDB is pinned to `hanumanji_agro`; Mongoose connections are pooled/cached for Next.js development.
- [x] `.env.example` contains placeholders only; private env files are ignored.
- [x] Cloudinary server credentials are configured and the Admin API returned HTTP 200. A real temporary upload was served from Cloudinary, listed through the owner media library, blocked from deletion while referenced by product/category, and deleted after references were removed.
- [ ] Resend and WhatsApp Cloud API values are not configured; email and automated WhatsApp delivery remain unverified.
- [ ] WhatsApp is implemented as click-to-chat in the public site. The optional Cloud API sender is not wired into automated public notifications.
- [ ] Product catalogue needs owner-approved data and images before launch.
- [ ] Confirm legal/privacy copy, production domain, provider sender verification, Atlas access restrictions and backups before public release.

## Verification

- [x] `npm run typecheck`
- [x] `npm test` (5 tests)
- [x] `npm run lint` (0 errors; 23 existing `<img>` optimization warnings)
- [x] `npm run build`
- [x] `npm run test:e2e` against a running local server with external notifications disabled; see [TESTING.md](./TESTING.md). Cloudinary upload/list/reference protection/deletion were exercised against the live provider.
- [x] Desktop and 390px mobile rendering checked in headless Chrome; mobile DOM reports a 390px document width with no offscreen visible elements.
- [x] Read-only post-test audit confirmed the original owner remains and temporary products, categories, enquiries and suppliers returned to zero. The temporary login session was revoked at logout.

The E2E script uses unique disposable records and cleans them up. It never bootstraps an owner or sends external notifications.
