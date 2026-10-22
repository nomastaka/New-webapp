const { URL } = require("node:url");
const { pool } = require("../db");
const { sha256 } = require("../security");

function configuredUpstream() {
  const raw = process.env.UPSTREAM_URL;
  if (!raw) throw new Error("Upstream is not configured");
  const url = new URL(raw);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("UPSTREAM_URL must use HTTPS in production");
  }
  if (url.username || url.password) throw new Error("Credentials must not be embedded in UPSTREAM_URL");
  return url;
}

async function reserveRequest(apiKey) {
  const keyHash = sha256(apiKey);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT * FROM api_keys WHERE key_hash = $1 FOR UPDATE",
      [keyHash]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid" };
    }
    const key = result.rows[0];
    const now = Date.now();
    if (!key.active || new Date(key.expires_at).getTime() <= now) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "inactive" };
    }
    if (Number(key.used_total) >= Number(key.quota_total)) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "quota" };
    }

    // The key row lock serializes reservations for this key. Store the rate event
    // in the same transaction so concurrent/in-flight requests count toward the limit.
    const rate = await client.query(
      "SELECT COUNT(*)::int AS n FROM api_rate_events WHERE api_key_id = $1 AND created_at > NOW() - INTERVAL '1 minute'",
      [key.id]
    );
    if (rate.rows[0].n >= key.rate_per_minute) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "rate" };
    }

    await client.query("INSERT INTO api_rate_events (api_key_id) VALUES ($1)", [key.id]);
    await client.query(
      "UPDATE api_keys SET used_total = used_total + 1, last_used_at = NOW() WHERE id = $1",
      [key.id]
    );
    await client.query("COMMIT");
    return { ok: true, id: key.id };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function logUsage(keyId, outcome, statusCode, latencyMs) {
  await pool.query(
    "INSERT INTO api_usage (api_key_id, outcome, status_code, latency_ms) VALUES ($1, $2, $3, $4)",
    [keyId, outcome, statusCode, Math.max(0, Math.min(600000, Math.trunc(latencyMs)))]
  );
}

async function forwardRequest(query) {
  const target = configuredUpstream();
  const allowed = new Set((process.env.UPSTREAM_ALLOWED_PARAMS || "id,type,page")
    .split(",").map(s => s.trim()).filter(Boolean));

  for (const [name, value] of Object.entries(query)) {
    if (!allowed.has(name)) continue;
    if (typeof value !== "string" || value.length > 500) {
      const err = new Error("Invalid query parameter");
      err.status = 400;
      throw err;
    }
    target.searchParams.set(name, value);
  }

  const headers = { Accept: "application/json" };
  const upstreamKey = process.env.UPSTREAM_KEY;
  if (upstreamKey) {
    const headerName = process.env.UPSTREAM_AUTH_HEADER || "Authorization";
    const scheme = process.env.UPSTREAM_AUTH_SCHEME;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(headerName)) throw new Error("Invalid upstream auth header configuration");
    headers[headerName] = scheme ? `${scheme} ${upstreamKey}` : upstreamKey;
  }

  const response = await fetch(target, {
    method: "GET",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const body = await response.text();
  if (body.length > 1_000_000) {
    const err = new Error("Upstream response exceeded size limit");
    err.status = 502;
    throw err;
  }
  return { status: response.status, contentType, body };
}

module.exports = { reserveRequest, logUsage, forwardRequest };
