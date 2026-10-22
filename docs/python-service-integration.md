# NIGHTSHIFT ↔ Python service integration checklist

## Current compatibility status

NIGHTSHIFT's gateway currently calls `UPSTREAM_URL` with **HTTP GET** and forwards approved query parameters. It optionally authenticates upstream requests using `UPSTREAM_KEY`, `UPSTREAM_AUTH_HEADER`, and `UPSTREAM_AUTH_SCHEME`.

The uploaded Python application exposes a Telegram webhook (`/webhook`), a health route (`/health`), and an admin route (`/admin`). The Telegram webhook is not a general-purpose API endpoint. Do not set `UPSTREAM_URL` to any of those routes.

## Required before connecting

1. Define a separate, documented API route for an approved corporate operation.
2. Require a dedicated API credential on that route; do not reuse the Telegram webhook secret, admin credential, or NIGHTSHIFT session secret.
3. Verify the credential server-side using a constant-time comparison or a well-reviewed authentication mechanism. Store secrets only in the hosting provider's secret environment settings.
4. Define a strict request schema and response schema. Reject unknown fields, enforce length limits, rate limits, timeouts, and response-size limits.
5. Return only fields required for the approved purpose. Avoid returning government identifiers, personal addresses, or bulk personal records unless there is a documented legal basis and a tightly controlled, audited need.
6. Keep `/admin` separate from API authentication. Do not use a query-string token for admin access.
7. Remove insecure defaults. In particular, `WEBHOOK_SECRET` must not default to a guessable value such as `1221`; startup should fail if a production secret is missing.
8. Keep the Telegram bot and the API as separate interfaces. Do not change Telegram webhook handling to accept arbitrary browser/API requests.
9. Confirm HTTPS, request logging without secrets, credential rotation, retention limits, and monitoring before production.
10. Test unauthorized requests, malformed requests, oversized responses, timeouts, revoked credentials, and rate-limit behavior before connecting live data.

## NIGHTSHIFT configuration

- `UPSTREAM_URL`: exact HTTPS URL of the new approved API route.
- `UPSTREAM_KEY`: a dedicated credential that the Python API actually verifies.
- `UPSTREAM_AUTH_HEADER`: normally `Authorization`.
- `UPSTREAM_AUTH_SCHEME`: normally `Bearer`.
- `UPSTREAM_ALLOWED_PARAMS`: only parameters documented for that API.

**Important:** Adding `UPSTREAM_KEY` in Render does not automatically secure the Python service. The Python service must explicitly validate that credential. Do not deploy the connection until the API endpoint and its authorization checks exist and have been tested.

## Current NIGHTSHIFT request contract

The existing `src/services/gateway.js` sends a GET request, forwards allowed query parameters, expects a response body, refuses redirects, applies a 10-second timeout, and limits the upstream response to about 1 MB. If the approved Python API requires POST/JSON instead, update the gateway and tests to match its documented contract; do not guess at the payload.
