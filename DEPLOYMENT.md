# Deployment

1. Create a least-privilege Hanumanji Agro Atlas database user, restrict Atlas network access to the application hosts where practical, and use the `hanumanji_agro` database.
2. Configure `.env.example` values in the protected service environment. Require a strong server-only `SESSION_SECRET`. Never expose provider secrets through `NEXT_PUBLIC_*` variables.
3. Build with `npm ci && npm run typecheck && npm test && npm run lint && npm run build`; start with `npm start`.
4. The single owner account already exists in the connected database. Do not run owner bootstrap during ordinary deployment. Use the recovery process only when explicitly needed.
5. Configure a verified Resend sender (`RESEND_API_KEY`, `EMAIL_FROM`, and owner notification address) before expecting notification or quotation email delivery. Verify provider configuration with `npm run integrations:verify`.
6. Cloudinary server credentials are configured and the owner upload/library/delete workflow has been verified. Until approved catalogue data and images are entered, the public catalogue remains empty by design.
7. WhatsApp currently uses click-to-chat. Automated WhatsApp delivery is not enabled by the app's normal enquiry workflow.
8. Confirm legal/privacy copy, production domain, Atlas network restrictions, backups, and provider sender verification before public release.

## Owner account recovery

`npm run admin:reset-password` is a direct server-side recovery command. Set the existing owner's email and new unique password in the protected environment, run the command, then remove the temporary password value. It updates only an existing owner, revokes all sessions and never creates an account.

## Backups and restore

Configure Atlas automated snapshots or point-in-time recovery appropriate to the selected tier. Restrict backup access and test restoration into a separate database before replacing production. Document retention and recovery objectives with the owner. The application does not automate backups.
