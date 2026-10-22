const crypto = require("node:crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualText(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function newApiKey() {
  return `sk_live_${crypto.randomBytes(32).toString("base64url")}`;
}

function csrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

module.exports = { sha256, safeEqualText, newApiKey, csrfToken };
