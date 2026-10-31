# Hanumanji Agro

Next.js App Router application for Hanumanji Agro, Kalimpong. Product orders are enquiry and quotation based; this site does not accept payments.

## Local development

1. Install Node.js 20+ and npm.
2. Copy `.env.example` to `.env.local`, add the private MongoDB URI and session secret, and confirm the URI targets `hanumanji_agro`.
3. Run `npm install` and `npm run dev`.
4. Sign in at `/admin/login` using the existing owner account.

The application does not silently substitute sample products when MongoDB is empty or unavailable. The connected catalogue was empty at the last audit; add only owner-approved categories and products in the admin dashboard. `npm run seed` is a separate reference-data utility and must not be run against production without reviewing its source and data first.

## Verification

See [TESTING.md](./TESTING.md) for unit, lint, build, integration, and disposable E2E checks. Keep external notifications disabled during E2E testing.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Set secrets only in the protected provider environment; never commit them.

## Source material

`references/client-original.html` and the embedded copy in `references/client-original.zip` were reviewed. `references/brand-logo.jpg` is used as the brand mark. Client supplied social URLs are retained. Product imagery and all catalogue claims should be confirmed by the owner before publication.
