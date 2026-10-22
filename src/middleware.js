
const { csrfToken, safeEqualText } = require("./security");

function attachCsrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = csrfToken();
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function getAllowedOrigin() {
  const configuredOrigin = process.env.PUBLIC_ORIGIN;

  if (!configuredOrigin) {
    return null;
  }

  try {
    return new URL(configuredOrigin).origin;
  } catch {
    return null;
  }
}

function verifyCsrf(req, res, next) {
  const expectedOrigin = getAllowedOrigin();
  const origin = req.get("Origin");
  const referer = req.get("Referer");
  const host = req.get("host") || "";

  if (origin) {
    let requestOrigin;

    try {
      requestOrigin = new URL(origin).origin;
    } catch {
      return res.status(403).send("Forbidden");
    }

    const allowed = expectedOrigin
      ? safeEqualText(requestOrigin, expectedOrigin)
      : process.env.NODE_ENV !== "production" &&
        safeEqualText(new URL(origin).host, host);

    if (!allowed) {
      return res.status(403).send("Forbidden");
    }
  } else if (referer) {
    let refererOrigin;

    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      return res.status(403).send("Forbidden");
    }

    const allowed = expectedOrigin
      ? safeEqualText(refererOrigin, expectedOrigin)
      : process.env.NODE_ENV !== "production" &&
        safeEqualText(new URL(referer).host, host);

    if (!allowed) {
      return res.status(403).send("Forbidden");
    }
  } else if (process.env.NODE_ENV === "production") {
    return res.status(403).send("Forbidden");
  }

  const token = req.body && req.body._csrf;
  const sessionToken = req.session && req.session.csrfToken;

  if (
    typeof token !== "string" ||
    typeof sessionToken !== "string" ||
    !safeEqualText(token, sessionToken)
  ) {
    return res.status(403).send("Invalid CSRF token");
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.redirect("/manager/login");
  }

  next();
}

module.exports = {
  attachCsrf,
  verifyCsrf,
  requireAdmin,
};
