const { csrfToken, safeEqualText } = require("./security");

function attachCsrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = csrfToken();
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrf(req, res, next) {
  const expectedOrigin = process.env.PUBLIC_ORIGIN;
  const origin = req.get("Origin");
  const referer = req.get("Referer");

  // Browsers normally send Origin for POST. If supplied, it must match the expected
  // configured origin; otherwise derive same-origin from the request host.
  if (origin) {
    let originUrl;
    try { originUrl = new URL(origin); } catch { return res.status(403).send("Forbidden"); }
    const allowed = expectedOrigin
      ? safeEqualText(originUrl.origin, expectedOrigin)
      : safeEqualText(originUrl.host, req.get("host") || "");
    if (!allowed) return res.status(403).send("Forbidden");
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      const allowed = expectedOrigin
        ? safeEqualText(refererUrl.origin, expectedOrigin)
        : safeEqualText(refererUrl.host, req.get("host") || "");
      if (!allowed) return res.status(403).send("Forbidden");
    } catch {
      return res.status(403).send("Forbidden");
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(403).send("Forbidden");
  }

  const token = req.body && req.body._csrf;
  if (typeof token !== "string" || !safeEqualText(token, req.session.csrfToken || "")) {
    return res.status(403).send("Invalid CSRF token");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.redirect("/manager/login");
  next();
}

module.exports = { attachCsrf, verifyCsrf, requireAdmin };
