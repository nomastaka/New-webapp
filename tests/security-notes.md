# Security verification checklist

Before production, test all items and record the results.

- [ ] Invalid, revoked, expired and exhausted API keys are rejected.
- [ ] Concurrent requests cannot exceed quota.
- [ ] Rate limits apply per key and at the edge.
- [ ] Admin routes redirect anonymous users and never expose key-management actions.
- [ ] Admin login is throttled and session ID rotates after authentication.
- [ ] Missing/invalid CSRF token and cross-origin POST are rejected.
- [ ] SQL inputs are treated as data (all SQL remains parameterized).
- [ ] EJS output remains escaped; no user-controlled value is rendered with unescaped `<%-`.
- [ ] User input cannot set the upstream URL, host, port, headers, or HTTP method.
- [ ] Redirecting upstream endpoints are rejected.
- [ ] Oversized input and oversized upstream responses are rejected.
- [ ] Error responses do not expose stack traces, SQL errors, configuration or secrets.
- [ ] Logs never contain Authorization headers, full API keys, passwords or session cookies.
- [ ] Production uses HTTPS and secure cookies.
- [ ] npm audit and dependency review completed; secrets scanned from repository history.
- [ ] Backup, recovery and administrator credential rotation procedures documented.

This checklist is not a certification or a substitute for an independent penetration test.
