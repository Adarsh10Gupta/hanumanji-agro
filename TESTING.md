# Hanumanji Agro release verification

## Automated checks

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` before deployment.

`npm run test:e2e` runs a disposable integration workflow against the configured `hanumanji_agro` database and a running local Next.js server. It requires the existing owner email/password in the private environment, and requires `DISABLE_EXTERNAL_NOTIFICATIONS=1` for both server and test runner. Start the built app in one terminal with:

```powershell
$env:DISABLE_EXTERNAL_NOTIFICATIONS='1'
npm run start -- -p 3027
```

Then run `npm run test:e2e` in a second terminal. The script verifies owner login and logout, public catalogue visibility, general and product enquiries, idempotency, enquiry administration, quotations and PDF, supplier administration, product publishing/archive, and protected routes. When Cloudinary credentials are configured, it uploads a temporary image, checks its hosted URL and media-library entry, tests product/category reference protection and product image selection, then deletes the asset. It creates unique `codex-e2e-*` category/product records and synthetic contacts, and removes those records and audit rows in `finally`. It never creates an owner or sends email.

Only run against the Hanumanji Agro test/development database. The script refuses any database other than `hanumanji_agro`. Do not use real customer details. If cleanup reports an issue, inspect only records with the unique `codex-e2e-` prefix before rerunning.

## External integrations

`npm run integrations:verify` performs read-only provider checks. Resend requires `RESEND_API_KEY` and `EMAIL_FROM`; Cloudinary requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Optional WhatsApp Cloud API credentials are documented in `.env.example`. WhatsApp is currently available as a click-to-chat contact path; automated Cloud API messaging must be configured and separately tested before claiming delivery.
