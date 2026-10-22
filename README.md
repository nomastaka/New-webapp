# Secure API Portal

A dark, browser-based API portal with a protected `/manager` dashboard, per-key quotas, expiration, revocation, and a fixed upstream API.

## Security design

- User API secrets are generated using cryptographic randomness and only SHA-256 hashes are stored.
- Admin accounts are separate from user API keys; passwords are hashed with Argon2id.
- Server-rendered EJS templates escape interpolated values by default.
- PostgreSQL access uses parameterized SQL.
- Admin POST forms require a session CSRF token and same-origin validation.
- Session cookies use HttpOnly, SameSite=Lax, and Secure in production; sessions are stored in PostgreSQL.
- User requests cannot choose a destination URL. The upstream URL is fixed in server environment configuration.
- Quota/rate accounting is performed in a database transaction with a row lock.
- API keys are submitted in an Authorization header, never in a query string.
- Helmet security headers, a restrictive CSP, request validation, rate limits, upstream timeout and redirect refusal are enabled.

This is a security-conscious starter, not a guarantee of zero vulnerabilities. Review and test before production.

## Requirements

- Node.js 20+
- PostgreSQL
- A fixed HTTPS upstream endpoint you own or are authorized to use

## Local setup

1. Copy `.env.example` to `.env`.
2. Configure `DATABASE_URL`, a random `SESSION_SECRET` (32+ bytes), `ADMIN_USERNAME`, and a strong unique `ADMIN_PASSWORD`.
3. Configure `UPSTREAM_URL`, optional `UPSTREAM_KEY`, auth header/scheme, and allowed query parameters.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:3000`; open `/manager` directly for the admin panel.

On startup, database tables are created. If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set and no admin exists, the first administrator is created. Remove both bootstrap variables after the first successful startup/redeploy. They do not reset an existing password.

## Render

1. Push this project to GitHub.
2. Create a Render Blueprint from `render.yaml`, or create a Node Web Service and PostgreSQL database manually.
3. Set `UPSTREAM_URL`, `UPSTREAM_KEY` if required, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in Render environment settings. Use a long, unique bootstrap password.
4. Deploy and wait for the service to start successfully.
5. Remove `ADMIN_USERNAME` and `ADMIN_PASSWORD` from environment settings after the admin is created, then redeploy.
6. Visit `/manager` directly. It is intentionally not linked from the public home page, but its security comes from server-side authentication—not obscurity.

For production, use a strong plan/database with backups appropriate to your needs, rotate secrets when needed, and review Render's current pricing/plan options before provisioning.

## Routes

- `/` — public landing page
- `/playground` — browser request interface
- `/manager` — protected admin login/dashboard
- `/api/v1/query` — API endpoint used by the playground
- `/healthz` — minimal health check

## Important configuration notes

- `UPSTREAM_URL` must be an HTTPS URL in production. The application refuses redirects from the upstream.
- `UPSTREAM_ALLOWED_PARAMS` controls which query parameter names may be forwarded. Adjust to match the upstream API's documentation.
- If upstream auth uses a non-Bearer scheme, set `UPSTREAM_AUTH_HEADER` and `UPSTREAM_AUTH_SCHEME` appropriately.
- The implementation forwards approved parameters only; it does not forward arbitrary headers supplied by users.
- Do not log, paste, or commit `.env` values or real API keys.
