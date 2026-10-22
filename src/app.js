const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const argon2 = require("argon2");
const { z } = require("zod");
const { pool } = require("./db");
const { sha256, newApiKey } = require("./security");
const { attachCsrf, verifyCsrf, requireAdmin } = require("./middleware");
const { reserveRequest, logUsage, forwardRequest } = require("./services/gateway");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
  app.set("view engine", "ejs");
  app.set("views", require("node:path").join(__dirname, "views"));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.urlencoded({ extended: false, limit: "10kb", parameterLimit: 30 }));
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(require("node:path").join(__dirname, "..", "public"), {
    dotfiles: "deny", index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  }));

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  app.use(session({
    store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
    name: "portal.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 4
    }
  }));

  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(attachCsrf);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7",
    legacyHeaders: false, message: "Too many login attempts. Try again later."
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7",
    legacyHeaders: false
  });

  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

  app.get("/", (_req, res) => res.render("home", { title: "NIGHTSHIFT // API GATEWAY" }));
  app.get("/playground", (_req, res) => res.render("playground", { title: "API TERMINAL" }));

  app.get("/manager", requireAdmin, async (req, res, next) => {
    try {
      const [keys, usage, recent] = await Promise.all([
        pool.query("SELECT id, label, key_prefix, active, quota_total, used_total, rate_per_minute, expires_at, created_at, last_used_at FROM api_keys ORDER BY created_at DESC LIMIT 100"),
        pool.query("SELECT COUNT(*)::int AS total FROM api_usage WHERE created_at > NOW() - INTERVAL '24 hours'"),
        pool.query("SELECT outcome, status_code, latency_ms, created_at, api_key_id FROM api_usage ORDER BY created_at DESC LIMIT 20")
      ]);
      res.render("manager", { title: "MANAGER // CONTROL", keys: keys.rows, usage24h: usage.rows[0].total, recent: recent.rows, newKey: req.session.newKey || null });
      delete req.session.newKey;
    } catch (e) { next(e); }
  });

  app.get("/manager/login", (_req, res) => res.render("login", { title: "MANAGER AUTHENTICATION", error: null }));
  app.post("/manager/login", loginLimiter, verifyCsrf, async (req, res, next) => {
    try {
      const schema = z.object({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(200)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).render("login", { title: "MANAGER AUTHENTICATION", error: "Invalid credentials." });

      const result = await pool.query("SELECT id, password_hash FROM admins WHERE username = $1", [parsed.data.username]);
      const valid = result.rowCount && await argon2.verify(result.rows[0].password_hash, parsed.data.password).catch(() => false);
      if (!valid) return res.status(401).render("login", { title: "MANAGER AUTHENTICATION", error: "Invalid credentials." });

      await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      req.session.adminId = result.rows[0].id;
      req.session.csrfToken = require("./security").csrfToken();
      await pool.query("UPDATE admins SET last_login_at = NOW() WHERE id = $1", [result.rows[0].id]);
      res.redirect("/manager");
    } catch (e) { next(e); }
  });

  app.post("/manager/logout", requireAdmin, verifyCsrf, (req, res, next) => {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie("portal.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      res.redirect("/");
    });
  });

  app.post("/manager/keys", requireAdmin, async (req, res, next) => {
    try {
      const schema = z.object({
        label: z.string().trim().min(1).max(80),
        quota: z.coerce.number().int().min(1).max(10000000),
        rate: z.coerce.number().int().min(1).max(10000),
        expiresDays: z.coerce.number().int().min(1).max(3650)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).send("Invalid key configuration.");
      const key = newApiKey();
      const prefix = key.slice(0, 16);
      const expiresAt = new Date(Date.now() + parsed.data.expiresDays * 86400000);
      await pool.query(
        "INSERT INTO api_keys (label, key_prefix, key_hash, quota_total, rate_per_minute, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [parsed.data.label, prefix, sha256(key), parsed.data.quota, parsed.data.rate, expiresAt]
      );
      req.session.newKey = key; // displayed once, never persisted in DB
      res.redirect("/manager");
    } catch (e) { next(e); }
  });

  app.post("/manager/keys/:id/revoke", requireAdmin, verifyCsrf, async (req, res, next) => {
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) return res.status(400).send("Invalid key id.");
      await pool.query("UPDATE api_keys SET active = FALSE WHERE id = $1", [id.data]);
      res.redirect("/manager");
    } catch (e) { next(e); }
  });

  app.post("/api/v1/query", apiLimiter, async (req, res) => {
    const started = Date.now();
    const auth = req.get("Authorization") || "";
    const match = /^Bearer (sk_live_[A-Za-z0-9_-]{40,})$/.exec(auth);
    if (!match) return res.status(401).json({ error: "A valid API key is required in the Authorization header." });

    const querySchema = z.object({
      id: z.string().max(500).optional(),
      type: z.string().max(100).optional(),
      page: z.string().regex(/^\d{1,6}$/).optional()
    }).strict();
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid or unsupported query parameters." });

    let reservation;
    try {
      reservation = await reserveRequest(match[1]);
      if (!reservation.ok) {
        const status = reservation.reason === "quota" || reservation.reason === "rate" ? 429 : 401;
        return res.status(status).json({ error: reservation.reason === "quota" ? "Request quota exhausted." : reservation.reason === "rate" ? "Rate limit exceeded." : "Invalid or inactive API key." });
      }
      try {
        const upstream = await forwardRequest(parsed.data);
        await logUsage(reservation.id, "completed", upstream.status, Date.now() - started);
        res.status(upstream.status);
        const safeType = upstream.contentType.split(";")[0].trim().toLowerCase();
        if (!/^(application\/json|text\/plain|application\/octet-stream)$/.test(safeType)) {
          return res.status(502).json({ error: "Unsupported upstream content type." });
        }
        res.type(safeType);
        return res.send(upstream.body);
      } catch (err) {
        await logUsage(reservation.id, "upstream_error", err.status || 502, Date.now() - started).catch(() => {});
        return res.status(err.status || 502).json({ error: "Upstream request failed." });
      }
    } catch (err) {
      console.error("API gateway error:", err.message);
      return res.status(500).json({ error: "Internal server error." });
    }
  });

  app.use((_req, res) => res.status(404).render("error", { title: "NOT FOUND", message: "The requested route does not exist." }));
  app.use((err, _req, res, _next) => {
    console.error("Request error:", err.message);
    if (res.headersSent) return;
    res.status(500).render("error", { title: "SYSTEM ERROR", message: "The request could not be completed." });
  });

  return app;
}

module.exports = { createApp };
