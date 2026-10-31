# Security checklist

- [x] Passwords use Argon2id; password hashes are excluded from normal Mongoose projections.
- [x] Opaque random session tokens are stored as HMAC-SHA256 hashes using a server-only secret.
- [x] Session cookies are HttpOnly and SameSite strict, Secure in production, and expire after 12 hours.
- [x] Logout revokes its session; password recovery revokes all sessions.
- [x] Owner-only APIs verify the primary owner marker. Public registration and staff role creation are absent.
- [x] Login and password changes have persistent rate limiting, generic failures, body limits and same-origin checks.
- [x] Public submissions use bounded validation, normalized contact details, consent persistence and idempotency keys.
- [x] Product references and quotation totals are resolved/calculated server-side.
- [x] Enquiry data persists independently from provider delivery; notification errors do not discard submissions.
- [x] Cloudinary upload and media management are owner-protected and server-signed; deletion checks references.
- [x] `.env.example` contains placeholders. `.env*` secrets are ignored.
- [x] Live DB audit confirms one active owner and unique owner/email indexes. No account reset or creation was performed.
- [ ] Resend, Cloudinary and WhatsApp credentials are absent in `.env.local`; configure and verify integrations before enabling them.
- [ ] Review legal/privacy copy and rehearse Atlas backup restoration before production launch.

Never log MongoDB URIs, API keys, password inputs/hashes, session tokens, cookies, or unnecessary customer information.
