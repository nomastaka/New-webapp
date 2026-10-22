const { Pool } = require("pg");
const argon2 = require("argon2");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      quota_total BIGINT NOT NULL CHECK (quota_total >= 1),
      used_total BIGINT NOT NULL DEFAULT 0 CHECK (used_total >= 0),
      rate_per_minute INTEGER NOT NULL CHECK (rate_per_minute >= 1),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS api_usage (
      id BIGSERIAL PRIMARY KEY,
      api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
      outcome TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage(created_at DESC);
    CREATE INDEX IF NOT EXISTS api_usage_key_idx ON api_usage(api_key_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS api_rate_events (
      id BIGSERIAL PRIMARY KEY,
      api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS api_rate_events_key_time_idx ON api_rate_events(api_key_id, created_at DESC);
  `);
  // Session table is created by connect-pg-simple.
}

async function bootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username && !password) return;
  if (!username || !password || password.length < 16) {
    throw new Error("Bootstrap admin requires ADMIN_USERNAME and an ADMIN_PASSWORD of at least 16 characters");
  }
  const existing = await pool.query("SELECT id FROM admins LIMIT 1");
  if (existing.rowCount > 0) return;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query(
    "INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
    [username, passwordHash]
  );
  console.log("Initial administrator created. Remove ADMIN_USERNAME and ADMIN_PASSWORD from the environment after startup.");
}

module.exports = { pool, initDatabase, bootstrapAdmin };
