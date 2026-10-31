# Architecture

- Next.js App Router, React and strict TypeScript. Public presentation is in `src/app`; server endpoints are Next.js Route Handlers.
- Mongoose models live in `src/lib/models.ts`; connection caching is in `src/lib/db.ts`.
- Public catalogue reads MongoDB and the UI uses the approved source catalogue as a read-only display fallback. Enquiry submits require persisted product IDs from the database.
- Enquiries are validated with Zod, resolve every submitted product against MongoDB, create/update a customer, and store product snapshots plus status history before attempting Resend notification.
- Owner sessions use random opaque tokens, SHA-256 token hashes stored in MongoDB, HttpOnly/SameSite cookies, expiration and logout invalidation. Passwords use Argon2id. Admin APIs perform server authorization.
- Owner bootstrap is a CLI script only; it refuses to overwrite an existing owner.
- Supplier submissions are stored separately. WhatsApp is a user initiated `wa.me` follow-up link after a saved enquiry.

Production hardening still needed: shared rate limiting, CSRF tokens for all cookie mutations, database backup automation, upload endpoint and signed Cloudinary policy, admin audit coverage, and full field-level admin management.
