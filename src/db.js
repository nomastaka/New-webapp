
"use strict";

const { Pool } = require("pg");
const argon2 = require("argon2");
const fs = require("node:fs");

const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = process.env.DATABASE_URL;
const caFile = process.env.DATABASE_SSL_CA_FILE;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Keep certificate verification enabled in production.
// If a private CA is required, provide its trusted PEM file using
// DATABASE_SSL_CA_FILE. Never disable rejectUnauthorized in production.

function createSslConfig() {
  if (!isProduction) {
    return undefined;
  }

  const sslMode = (
    process.env.DATABASE_SSL_MODE || "verify"
  ).trim().toLowerCase();

  // For Render's internal PostgreSQL URL only:
  // keep TLS encryption, but allow its self-signed certificate.
  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  if (sslMode !== "verify") {
    throw new Error(
      'DATABASE_SSL_MODE must be "verify" or "require"'
    );
  }

  const ssl = { rejectUnauthorized: true };

  if (caFile) {
    let ca;

    try {
      ca = fs.readFileSync(caFile, "utf8");
    } catch (error) {
      throw new Error(
        `Unable to read DATABASE_SSL_CA_FILE: ${error.message}`
      );
    }

    if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
      throw new Error(
        "DATABASE_SSL_CA_FILE must contain a valid PEM CA certificate"
      );
    }

    ssl.ca = ca;
  }

  return ssl;
}


const pool = new Pool({
  connectionString: databaseUrl,
  max: Number.parseInt(process.env.DB_POOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: createSslConfig()
});

pool.on("error", (error) => {
  // Do not log connection strings, credentials, or query parameters.
  console.error("Unexpected PostgreSQL pool error:", error.message);
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
      rate_per_minute INTEGER NOT NULL
        CHECK (rate_per_minute >= 1),
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

    CREATE INDEX IF NOT EXISTS api_usage_created_at_idx
      ON api_usage(created_at DESC);

    CREATE INDEX IF NOT EXISTS api_usage_key_idx
      ON api_usage(api_key_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS api_rate_events (
      id BIGSERIAL PRIMARY KEY,
      api_key_id BIGINT NOT NULL
        REFERENCES api_keys(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS api_rate_events_key_time_idx
      ON api_rate_events(api_key_id, created_at DESC);
  `);

  // connect-pg-simple creates and manages the session table.
}

async function bootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  // Bootstrap credentials are optional after the first admin exists.
  if (!username && !password) {
    return;
  }

  if (
    !username ||
    !password ||
    username.trim().length === 0 ||
    password.length < 16
  ) {
    throw new Error(
      "Bootstrap admin requires ADMIN_USERNAME and an " +
      "ADMIN_PASSWORD of at least 16 characters"
    );
  }

  const existing = await pool.query(
    "SELECT id FROM admins LIMIT 1"
  );

  if (existing.rowCount > 0) {
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id
  });

  await pool.query(
    `INSERT INTO admins (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING`,
    [username.trim(), passwordHash]
  );

  console.log(
    "Initial administrator bootstrap completed. " +
    "Remove ADMIN_USERNAME and ADMIN_PASSWORD from the " +
    "environment after confirming the administrator can log in."
  );
}

async function checkDatabase() {
  const result = await pool.query(
    "SELECT NOW() AS database_time"
  );

  return {
    connected: true,
    databaseTime: result.rows[0].database_time
  };
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  initDatabase,
  bootstrapAdmin,
  checkDatabase,
  closeDatabase
};
