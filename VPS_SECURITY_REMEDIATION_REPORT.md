# VPS Security Remediation Report

## Status

Implementation is on `security/vps-remediation`. Changes are uncommitted and undeployed. No production database, real email, Cloudinary upload, or WhatsApp operation was performed.

## Six approved remediations

### 1. Trusted client IP and rate limiting

Rate limiting accepts only one IP address from `TRUSTED_CLIENT_IP_HEADER` (default: `x-real-ip`). It validates the value and rejects missing, malformed, or comma-separated values instead of reading arbitrary forwarded chains or using a shared fallback bucket. Existing public form and administrative rate limits remain in place.

Vercel header behavior is not established by this repository. Do not assume Vercel supplies or overwrites `x-real-ip`; verify the deployed ingress and configure the header only after confirming the trust boundary. Missing or malformed header data remains fail-closed. The future VPS setup uses Nginx to overwrite the selected header and requires loopback/private binding plus firewall rules blocking direct access to the app port.

The application cannot establish a trusted network boundary by itself. Bind Next.js to `127.0.0.1:3000` on a single VPS, or restrict its private app port to the proxy with firewall/network policy. Do not expose the app port publicly. Install/configure Nginx and the firewall as a separate, manually approved VPS operation.

Example for direct client-to-Nginx traffic:

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    client_max_body_size 64k;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;

    location ^~ /api/admin/uploads {
        client_max_body_size 6m;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

These directives overwrite caller-supplied forwarding headers. If a CDN or load balancer precedes Nginx, configure Nginx's real-IP module to trust only that provider's published source ranges before using `$remote_addr`; select the matching trusted header with `TRUSTED_CLIENT_IP_HEADER`. Never trust arbitrary forwarded chains or all source addresses.

### 2. MongoDB index initialization

Public enquiry and supplier routes no longer call `createIndex`. Existing schema index declarations remain. Mongoose automatic index creation is disabled for application connections, preventing indexes from being created implicitly at startup or on requests.

Added `npm run db:indexes:verify`, a read-only verifier that checks all declared application indexes, including unique and TTL indexes, and scans the complete enquiry and supplier collections for duplicate idempotency keys. The duplicate aggregations may be expensive on large collections; coordinate with the database administrator and run during a suitable window using a least-privilege read-only database credential. The verifier never creates, drops, or changes indexes and was not run against production.

Before enabling public submissions or the notification worker in production:

1. Back up the database and review the current indexes and duplicate-scan impact with the database administrator.
2. Run the verifier with a read-only `MONGODB_URI` against the intended database.
3. If checks fail, have the database administrator investigate duplicates and approve any needed index creation through Atlas or `mongosh` in a planned maintenance window.
4. Re-run the verifier and enable public traffic only after required indexes are confirmed.

Index builds do not intentionally alter documents, but consume resources; unique builds can fail when duplicate values exist. No production data was inspected or modified here.

### 3. Email abuse protection and reliability

Public enquiry and supplier notifications are now queued in an additive MongoDB outbox and sent by the separately managed `npm run notifications:worker` process. Public form responses no longer wait for the email provider. Stable notification keys, an atomic queue reservation, worker leases, and the provider idempotency key prevent duplicate queue entries and reduce duplicate sends after retries or process restarts. Customer acknowledgement jobs are checked again against the saved consent and current notification preference before sending.

The global defaults are 100 distinct notification keys per UTC delivery day and 250 pending notifications. Daily budget capacity is reserved atomically immediately before provider delivery, across worker processes. Old queued notifications cannot use a prior day's allocation; when the current day's budget is exhausted, a job is deferred until the next UTC midnight without consuming a delivery attempt. Optional `EMAIL_DAILY_BUDGET` and `EMAIL_MAX_PENDING` values must be integers from 1 to 10000. Transient delivery failures are retried at most three times; jobs still pending after seven days fail, and completed payloads have a 30-day TTL. No infinite retry loop is used. Direct email actions also consume the global daily budget.

Queue reservations are stored as keyed entries with timestamps. Admission uses an atomic per-document capacity condition; reconciliation adds missing reservations and removes only aged orphan reservations whose timestamp is still stale, rather than replacing the reservation snapshot. Existing legacy key-array reservations are counted and migrated during reconciliation. A worker updates an entity only after its lease-token-guarded outbox transition succeeds. Worker restart reclaims expired leases; forced process termination may delay recovery until the lease expires.

The additive outbox, queue-state, and daily-budget collections/indexes must be operationally prepared before enabling notification traffic. Start the worker only after approved production configuration and index verification. The worker can send real emails once deployed with provider credentials; it was not started during this work.

### 4. Request-body size protection

JSON and multipart request bodies are read as bounded streams and rejected before parsing once the configured byte ceiling is exceeded; `Content-Length` is an early-rejection hint only, not the sole limit. Missing or misleading lengths are still bounded by streamed byte counts; malformed lengths are rejected. Multipart uploads are capped at 5.2 MiB of request data and individual images remain capped at 5 MiB. Existing MIME and magic-byte checks remain.

The Nginx example uses `client_max_body_size 64k` generally and `6m` for `/api/admin/uploads`, above the application's multipart envelope but still bounded.

### 5. Bounded database reads

Public and admin product catalogues now use bounded database pages (48 public products and 100 admin products) with server-side search/category filtering, stable secondary ordering, and navigation; no product is silently omitted from the catalogue view. The homepage intentionally loads a small 12-product preview, with the full catalogue available at `/products`. Sitemap entries are fetched in all-product keyset batches. Customer enquiry history is paginated (20 by default, maximum 100) and projected to the fields shown in the existing admin UI.

The public product API now returns `{ products, total, page, pages }` for paginated lookups. The enquiry form uses the bounded `?slugs=` form to refresh its current cart products. The admin product API returns pagination metadata as well. These are response-shape changes for callers of the old unpaginated APIs; update any external consumers. The customer-history response retains its `customer` and `enquiries` fields and adds `total`, `page`, and `pages`.

### 6. Cloudinary upload timeout

Cloudinary uploads now have a 15-second outbound timeout. Timeout, network, provider, and malformed-response cases return bounded errors. The response is checked for HTTPS, the configured Cloudinary host/account, the generated asset ID, dimensions, and supported format before returning a URL to the admin client. Existing image validation remains unchanged. No image was uploaded during implementation or testing.

## Files modified

Application, configuration, and documentation:

- `.env.example`
- `DEPLOYMENT.md`
- `package.json`
- `src/app/admin/categories/page.tsx`
- `src/app/admin/products/page.tsx`
- `src/app/api/admin/categories/[id]/route.ts`
- `src/app/api/admin/categories/route.ts`
- `src/app/api/admin/customers/[id]/route.ts`
- `src/app/api/admin/enquiries/[id]/retry-notification/route.ts`
- `src/app/api/admin/enquiries/[id]/route.ts`
- `src/app/api/admin/enquiries/[id]/send-quotation/route.ts`
- `src/app/api/admin/login/route.ts`
- `src/app/api/admin/media/route.ts`
- `src/app/api/admin/products/[id]/route.ts`
- `src/app/api/admin/products/route.ts`
- `src/app/api/admin/security/password/route.ts`
- `src/app/api/admin/settings/route.ts`
- `src/app/api/admin/suppliers/[id]/retry-notification/route.ts`
- `src/app/api/admin/suppliers/[id]/route.ts`
- `src/app/api/admin/uploads/route.ts`
- `src/app/api/enquiries/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/suppliers/route.ts`
- `src/app/page.tsx`
- `src/app/products/page.tsx`
- `src/app/sitemap.ts`
- `src/components/admin/AdminProductTable.tsx`
- `src/components/admin/CustomerManager.tsx`
- `src/components/public/EnquiryPageForm.tsx`
- `src/components/public/ProductCatalogue.tsx`
- `src/lib/cloudinary-upload.ts`
- `src/lib/catalog-pagination.ts`
- `src/lib/db.ts`
- `src/lib/email-budget.ts`
- `src/lib/email-outbox.ts`
- `src/lib/email.ts`
- `src/lib/enquiry-notifications.ts`
- `src/lib/models.ts`
- `src/lib/security.ts`
- `src/lib/index-verification.ts`
- `scripts/notification-worker.ts`
- `scripts/verify-indexes.ts`
- `tests/enquiry-notifications.test.ts`
- `tests/security-protections.test.ts`
- `tests/remediation-corrections.test.ts`
- `VPS_SECURITY_REMEDIATION_REPORT.md`

The pre-existing `tsconfig.tsbuildinfo` worktree modification is not part of the remediation. A TypeScript check invoked through npm unexpectedly rewrote it during validation; it was not restored or edited afterward. Its current SHA-256 is `7B48E30C5E8C761BA4E324E73C4E73A2567CDCCDE4985D6F049DB27DCB03E746`. A later direct typecheck and isolated production build verified that this current content remained unchanged.

## Validation performed

- `npm test`: passed, 34 tests total (28 TypeScript tests and 6 Node tests). Email and Cloudinary requests were mocked; no provider request was made. Intermediate runs exposed outdated source-pattern assertions in tests; the assertions were corrected and the complete suite then passed.
- TypeScript: `node .\node_modules\typescript\bin\tsc --noEmit --incremental false` passed. The protected build-info hash was unchanged during this direct check.
- `npm run lint`: passed with 0 errors and 22 `<img>` optimization warnings.
- `npm run build`: passed in an isolated same-drive copy of the workspace with local environment files excluded and copied dependencies. An initial build attempt using a `node_modules` junction failed because Next/Webpack resolved the Windows junction path incorrectly; the retry with actual copied dependencies completed successfully. The workspace's build-info file remained unchanged.
- Production index verification, database tests, live email, Cloudinary upload, deployment, load tests, and WhatsApp delivery were not run.

The first correction TypeScript check found a lean-result typing issue and malformed regex in a test; both were fixed before the passing validation above. The protected build-info hash was `7B48E30C5E8C761BA4E324E73C4E73A2567CDCCDE4985D6F049DB27DCB03E746` before and after the final direct type check and isolated build.

## Environment and deployment

No new secret is required. Optional non-secret settings are:

- `TRUSTED_CLIENT_IP_HEADER` (default `x-real-ip`; set only to the header the trusted proxy overwrites).
- `EMAIL_DAILY_BUDGET` (default `100`; range `1`-`10000`).
- `EMAIL_MAX_PENDING` (default `250`; range `1`-`10000`).

Deployment steps requiring operator approval:

1. Review this branch and the Nginx/firewall topology; configure Next.js to listen on loopback or an isolated private network reachable only from the trusted proxy.
2. Back up production data and obtain database-administrator approval for the read-only index verification and any separately approved index builds.
3. Verify required production indexes before opening public submission traffic.
4. Configure the trusted proxy header and body-size limits; validate the real-IP chain for any CDN/load balancer.
5. Deploy the application. Start the managed notification worker only after verifying indexes, email consent/preferences, sender configuration, and the approved daily/pending budgets.
6. Monitor queue depth, delivery failures, proxy IP rejection, and request-size rejections.

## Rollback

1. Stop the notification worker before rolling back application code, so queued notifications are not sent unexpectedly.
2. Roll back the application release and route traffic only through the approved proxy boundary. The prior version may have different index behavior; have the database administrator review that behavior before accepting public traffic.
3. Do not drop the additive outbox, queue-state, or daily-budget collections, remove indexes, or delete records as part of rollback. Preserve queued data for review and recovery if the remediation is redeployed.
4. Keep Nginx body-size and proxy-header settings aligned with whichever application version is running. Re-enable the worker only after the new version and queue state are reviewed.

## Remaining limitations and manual decisions

- The final VPS/CDN/load-balancer topology and trusted source ranges are unknown; an operator must configure and verify the actual proxy boundary.
- Vercel's request-header overwrite behavior is not confirmed by repository evidence. Verify it against the actual deployment before relying on `x-real-ip` for rate limits.
- Production index state and duplicate records were not inspected. A database administrator must approve verification and any index creation before public traffic or worker activation.
- Email delivery is asynchronous and depends on a separately supervised worker. Daily budgets count distinct idempotency keys per UTC delivery day; the same key can consume a slot again on a later day if it is retried then.
- Pagination page sizes are bounded (48 public, 100 admin/API). The sitemap batches through every visible product, but a very large catalogue may require sitemap sharding to comply with external sitemap protocol entry limits.
- The public products and admin products API response shapes changed to expose paginated results; only the enquiry form's slug-lookup response remains an array.
- `tsconfig.tsbuildinfo` remains a dirty, non-remediation worktree file with the current hash recorded above; it was not staged or committed.

## Independent-review corrections

The follow-up review corrections on this branch:

1. **Index verification:** derives expected indexes from each Mongoose schema and compares index names, ordered key patterns, uniqueness/sparsity/TTL, partial filters, collation, and other listed index options. It remains read-only. Added pure tests for wrong names, keys, ordering, and options.
2. **Worker lease race:** outbox terminal/cancellation transitions now require the current lease token; entity notification status changes happen only after a successful guarded transition. A stale worker cannot overwrite the current worker's status.
3. **Queue reconciliation:** reservations now carry timestamps. Atomic admission reserves one of the configured slots; reconciliation prunes only aged orphan entries with a matching stale timestamp and adds missing active-job reservations without snapshot replacement. Existing active jobs can drain if the configured capacity is reduced; no new work is admitted until below the cap.
4. **Delivery-day budget:** worker email sends use the same atomic per-day reservation as direct email. Budget exhaustion schedules the queued job for the next UTC day and restores the attempt count, preventing repeated budget-only retries from exhausting the provider retry limit.
5. **Proxy compatibility:** docs separately describe the unverified Vercel ingress and the future Nginx VPS boundary. Tests cover absent, malformed, valid, and untrusted forwarded-chain values. Code behavior intentionally remains fail-closed.
6. **Catalogue discovery:** public and admin catalogue pages and APIs paginate; server-side filters and stable sort keys are used; sitemap generation keyset-scans all visible products. Tests exercise page boundaries beyond 500 results and verify pagination wiring.

New correction tests are in `tests/remediation-corrections.test.ts`; the existing security-protection tests also cover trusted-header handling. Mocked/in-memory tests do not connect to MongoDB or external providers. The index verifier was not executed.
