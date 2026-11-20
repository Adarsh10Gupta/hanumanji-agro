# Deployment

1. Create a least-privilege Hanumanji Agro Atlas database user, restrict Atlas network access to the application hosts where practical, and use the `hanumanji_agro` database.
2. Configure `.env.example` values in the protected service environment. Require a strong server-only `SESSION_SECRET`. Never expose provider secrets through `NEXT_PUBLIC_*` variables.
3. Build with `npm ci && npm run typecheck && npm test && npm run lint && npm run build`; start with `npm start`.
4. The single owner account already exists in the connected database. Do not run owner bootstrap during ordinary deployment. Use the recovery process only when explicitly needed.
5. Configure a verified Resend sender (`RESEND_API_KEY`, `EMAIL_FROM`, and owner notification address) before expecting notification or quotation email delivery. Verify provider configuration with `npm run integrations:verify`.
6. Cloudinary server credentials are configured and the owner upload/library/delete workflow has been verified. Until approved catalogue data and images are entered, the public catalogue remains empty by design.

## Release E2E runner safety

The release runner refuses to start without `--test-mode`, `E2E_TEST_MODE=1`, an explicit `E2E_TEST_MONGODB_URI`, and a dedicated `E2E_TEST_DATABASE_NAME` ending in `_test` or `_e2e` (or beginning with `test_`/`e2e-`). The URI database path must exactly match that name. Production indicators, non-local application URLs, missing test owner credentials, and enabled email or WhatsApp are rejected before the runner connects to MongoDB. The runner does not load `.env.local`, does not use `MONGODB_URI` as a fallback, and does not upload/delete Cloudinary assets. It cleans up only document IDs recorded during its own execution.

Run only against a separately started local application process configured with the same isolated test MongoDB database name and dedicated test credentials. Explicitly override any inherited production values before starting the application; do not rely on `.env.local` or an existing server process. The E2E runner accepts only a loopback MongoDB host and local application URL, and it does not start a notification worker. Keep all workers stopped during the test. For example, in PowerShell:

```powershell
$env:E2E_TEST_MODE = '1'
$env:E2E_TEST_DATABASE_NAME = 'hanumanji_agro_e2e'
$env:E2E_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/hanumanji_agro_e2e'
$env:E2E_TEST_TOKEN = '<random-test-only-token-at-least-32-characters>'
$env:MONGODB_URI = $env:E2E_TEST_MONGODB_URI
$env:MONGODB_DATABASE_NAME = $env:E2E_TEST_DATABASE_NAME
$env:DISABLE_EXTERNAL_NOTIFICATIONS = '1'
$env:E2E_DISABLE_WHATSAPP = '1'
$env:ADMIN_BOOTSTRAP_EMAIL = 'e2e-owner@example.invalid'
$env:ADMIN_BOOTSTRAP_PASSWORD = '<dedicated-test-password>'
npm run dev -- --port 3027
```

In another PowerShell process, set the same E2E variables (including the identical test-only token) and run `npm run test:e2e -- http://localhost:3027`. Before any test mutation, the runner calls a token-protected readiness endpoint. The app verifies the actual connected database name, loopback MongoDB host, URI path, test mode, and disabled email/WhatsApp settings before it reports readiness. The runner independently restricts its MongoDB URI and app URL to loopback.
7. WhatsApp currently uses click-to-chat. Automated WhatsApp delivery is not enabled by the app's normal enquiry workflow.
8. Confirm legal/privacy copy, production domain, Atlas network restrictions, backups, and provider sender verification before public release.

## VPS systemd and HTTPS operations

Create two systemd units on the VPS: `hanumanji-next.service` for `npm start` and `hanumanji-notifications.service` for `npm run notifications:worker`. Both must run as the dedicated deploy user, use `WorkingDirectory=/var/www/hanumanji-agro`, load a root-owned environment file with `EnvironmentFile=/etc/hanumanji-agro/app.env`, and set `Restart=always` / `RestartSec=5`. The application unit must include `Environment=HOSTNAME=127.0.0.1` and `Environment=PORT=3000`. Do not grant the deploy user write access to the protected environment file. Enable each unit with `systemctl enable --now`; bind port 3000 only to loopback through `HOSTNAME=127.0.0.1`.

Use Nginx as the TLS terminator and reverse proxy. Obtain certificates only through an explicitly approved DNS and Hostinger/VPS configuration operation. Configure HTTP to redirect to HTTPS, add Nginx TLS configuration managed by the certificate provider, keep `server_name` limited to the approved domain, and set `proxy_set_header X-Real-IP $remote_addr` while overwriting any client-supplied value. Add UFW rules for ports 22, 80 and 443 only; do not open port 3000.

Useful read-only operational checks:

```bash
sudo systemctl status hanumanji-next hanumanji-notifications
sudo journalctl -u hanumanji-next -n 200 --no-pager
sudo journalctl -u hanumanji-notifications -n 200 --no-pager
sudo ss -ltnp | grep -E ':3000|:80|:443'
sudo nginx -t
```

For release rollback, stop only the notification worker, deploy the approved previous application revision, start the application, verify health and monitor logs, then restart the worker. Do not clear MongoDB queue records. If a worker or application process exits, systemd should restart it; preserve queued records and investigate provider and lease state before manual intervention.

Environment names required by the VPS (values remain secret):
`MONGODB_URI`, `MONGODB_DATABASE_NAME`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `TRUSTED_CLIENT_IP_HEADER`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_NOTIFICATION_EMAIL`, `BUSINESS_NOTIFICATION_EMAIL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_SITE_URL`, `EMAIL_MAX_PENDING`, `EMAIL_DAILY_BUDGET`, `DISABLE_EXTERNAL_NOTIFICATIONS`. Do not set `DISABLE_EXTERNAL_NOTIFICATIONS=1` in normal production.

## VPS reverse proxy and request limits

Run the Next.js server on loopback (for a single VPS, configure the service with `HOSTNAME=127.0.0.1` and `PORT=3000`) and expose only Nginx to the public network. Do not publish port 3000 or permit direct access to the Node process. For container or multi-host deployments, use an isolated private network/firewall rule that permits the app port only from the proxy.

The application reads exactly one trusted client-IP header. `TRUSTED_CLIENT_IP_HEADER` defaults to `x-real-ip`; set it to the header configured below if the final topology uses a different trusted header. The app rejects missing, malformed, or comma-separated addresses rather than sharing a fallback bucket.

### Vercel versus VPS

The repository does not establish which client-IP headers Vercel sets, whether it overwrites caller-supplied values, or whether the application can be reached through another ingress. Do not assume `x-real-ip` is supplied or trusted on Vercel based only on the application code. Before enabling rate-limited public endpoints on Vercel, verify the deployed request path and header behavior using the actual Vercel configuration. Configure `TRUSTED_CLIENT_IP_HEADER` only for a header the trusted ingress reliably overwrites. If the selected header is missing or malformed, rate-limited routes fail closed; do not substitute an untrusted forwarding header or a shared fallback bucket.

For a VPS, the Nginx configuration below explicitly overwrites `X-Real-IP` with the proxy-observed `$remote_addr`. Bind the application to loopback or an isolated private interface, and enforce the boundary with host/cloud firewall rules so no public client can reach the Node port directly. If a CDN/load balancer precedes Nginx, trust only its published source ranges in Nginx's real-IP configuration before using `$remote_addr`. Header validation in the app is not a substitute for this network boundary.

Example Nginx directives for a direct, single-VPS client-to-Nginx connection:

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

These settings overwrite forwarded values supplied by clients. If an external load balancer/CDN sits in front of Nginx, configure Nginx's real-IP module to trust only that provider's published source ranges before using `$remote_addr`; never trust arbitrary forwarded chains or all source IPs. Install and configure Nginx/firewall rules as a separate VPS operation; this repository does not assume Nginx is installed.

## Notification delivery and global budget

Public enquiry and supplier notifications are written to an additive MongoDB outbox and returned as `pending`; a separate worker sends them. The queue holds at most 250 pending notifications, and the global cap of 100 distinct email idempotency keys is reserved on the UTC day the provider send is attempted. If the day's budget is exhausted, a job remains queued for the next UTC day without consuming a delivery retry. Provider retries use the same idempotency key, while a retry on a later day must reserve that day's budget. Transient provider failures are attempted at most three times. Jobs still pending after seven days are marked failed; completed queue payloads expire after 30 days. The bounds can be changed with `EMAIL_MAX_PENDING` and `EMAIL_DAILY_BUDGET` (integers from 1 to 10000); defaults apply when unset.

Before enabling public notifications, explicitly create the indexes described under “Production index verification” and start one or more managed worker processes with `npm run notifications:worker`. Use the same protected environment as the app and configure a process manager to restart it on VPS reboot. Do not run that worker in tests or environments where external email must remain disabled.

On SIGINT/SIGTERM, the worker finishes the current processing call before disconnecting. A forced stop leaves a processing lease that can be reclaimed after it expires. Younger queued notifications remain eligible for delivery after a restart or rollback followed by redeployment; stop the worker and review queue state before switching application versions. Do not clear queued records as a rollback step.

## Production index verification

The app disables automatic Mongoose index creation. Public request handlers do not create indexes. The read-only verifier checks every currently declared application index, including existing unique indexes and the new idempotency, customer-history, outbox, budget-TTL, and queue indexes. Any missing index must be reviewed and created as a deliberate database operation.

1. Back up the Atlas database and inspect collection/index sizes and deployment impact with the database administrator.
2. Before creating unique indexes, investigate duplicates for the enquiry and supplier `idempotencyKey` fields. The verifier performs a read-only aggregation across each complete collection to find duplicate keys. This may consume database resources on large collections; schedule it with the database administrator during a suitable window. It also checks expected index names/options.
3. Use a least-privilege read-only database credential and run `npm run db:indexes:verify` against the intended database. This command only lists indexes and reads duplicate groups; it never creates or modifies an index.
4. If indexes are missing, have the database administrator approve and create them in a maintenance window through Atlas/`mongosh`, after confirming there are no duplicate indexed values. Do not run index creation from application startup or a public route.
5. Re-run the read-only verifier and confirm all checks pass before enabling form submissions or the notification worker.

The verifier derives the expected ordered key patterns and options from all declared Mongoose schema indexes and compares index name, ordered keys, uniqueness, sparsity, TTL, partial filters, collation, and other relevant MongoDB options. It checks all schema-declared indexes for products, categories, customers, enquiries, suppliers, admins, sessions, rate limits, email outbox, daily email budget, and site settings. In particular, it expects:

- `Enquiry.idempotencyKey_1` and `SupplierEnquiry.idempotencyKey_1` to be unique sparse indexes.
- `Enquiry.customer_1_createdAt_-1` to support bounded customer-history paging.
- `EmailOutbox.key_1` unique, `EmailOutbox.status_1_availableAt_1_createdAt_1`, and TTL on `deleteAt`.
- TTL on `EmailDailyBudget.expiresAt`.

Index builds do not intentionally alter documents, but they consume database resources; a unique-index build can fail if duplicates exist. The verifier does not resolve duplicates or modify production data.

## Catalogue pagination

The public catalogue page and admin product manager now use bounded database pages (48 public products and 100 admin products by default), with server-side search/category filtering and navigation. The public products API returns `{ products, total, page, pages }` for paginated requests; the enquiry form uses the bounded `?slugs=` lookup to refresh only products in the customer's cart. Admin API product listing likewise returns pagination metadata. This changes the prior unpaginated array response for clients that called the products API without `slugs`; update any external consumer accordingly. The homepage intentionally shows a small featured preview; the paginated catalogue remains the full discovery path. Sitemap generation walks the complete visible catalogue in bounded `_id` keyset batches rather than stopping at 500.

## Owner account recovery

`npm run admin:reset-password` is a direct server-side recovery command. Set the existing owner's email and new unique password in the protected environment, run the command, then remove the temporary password value. It updates only an existing owner, revokes all sessions and never creates an account.

## Backups and restore

Configure Atlas automated snapshots or point-in-time recovery appropriate to the selected tier. Restrict backup access and test restoration into a separate database before replacing production. Document retention and recovery objectives with the owner. The application does not automate backups.
