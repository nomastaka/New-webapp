# Integration readiness checklist

Do not connect live corporate data until all applicable checks pass.

- [ ] A dedicated API route exists; it is not the Telegram webhook, health endpoint, or admin page.
- [ ] API credential is separate from webhook, admin, and session secrets.
- [ ] Missing, invalid, expired, and revoked credentials are rejected.
- [ ] Production startup fails if required secrets are missing or insecure defaults are present.
- [ ] Request schema rejects unknown fields and oversized values.
- [ ] Only approved query/body fields are forwarded.
- [ ] Only approved response fields are returned.
- [ ] Personal and government identifiers are not returned unless explicitly authorized and necessary.
- [ ] Rate limits apply per key and at the service edge.
- [ ] Timeout and response-size limits are tested.
- [ ] Errors reveal no secrets, stack traces, internal URLs, or database details.
- [ ] Logs do not record API keys, webhook secrets, passwords, session cookies, or full sensitive payloads.
- [ ] Admin route uses independent authentication and is not protected by a query-string secret.
- [ ] HTTPS and secure cookies are enabled in production.
- [ ] Database backup/restore and retention policies are documented.
- [ ] Render database plan is appropriate for the data's retention and availability requirements.
- [ ] `npm run check` passes and dependency/security reviews are complete.
