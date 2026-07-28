import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminCookie,
  createAdminSessionToken,
  hashAdminPassword,
  isAdminMfaRequired,
  isMobileAdminTotpLoginAllowed,
  isSameOriginRequest,
  verifyAdminPassword,
  verifyAdminSessionToken,
  verifyAdminTotp,
} from "../lib/admin/auth.js";

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("admin password and signed session fail closed", () => {
  const previousPassword = process.env.FIRSTSTEP_ADMIN_PASSWORD;
  const previousSecret = process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
  process.env.FIRSTSTEP_ADMIN_PASSWORD = "a-strong-owner-password";
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    assert.equal(verifyAdminPassword("a-strong-owner-password"), true);
    assert.equal(verifyAdminPassword("wrong-password"), false);

    const now = Date.parse("2026-07-24T12:00:00Z");
    const token = createAdminSessionToken(now);
    assert.equal(verifyAdminSessionToken(token, now + 1000), true);
    assert.equal(verifyAdminSessionToken(`${token}tampered`, now + 1000), false);
    assert.equal(verifyAdminSessionToken(token, now + (ADMIN_SESSION_TTL_SECONDS + 1) * 1000), false);
  } finally {
    restoreEnvironment("FIRSTSTEP_ADMIN_PASSWORD", previousPassword);
    restoreEnvironment("FIRSTSTEP_ADMIN_SESSION_SECRET", previousSecret);
  }
});

test("production admin passwords use a one-way scrypt hash", () => {
  const previousPassword = process.env.FIRSTSTEP_ADMIN_PASSWORD;
  const previousHash = process.env.FIRSTSTEP_ADMIN_PASSWORD_HASH;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRequirement = process.env.FIRSTSTEP_ADMIN_REQUIRE_PASSWORD_HASH;
  process.env.NODE_ENV = "production";
  process.env.FIRSTSTEP_ADMIN_REQUIRE_PASSWORD_HASH = "true";
  process.env.FIRSTSTEP_ADMIN_PASSWORD = "legacy-plaintext-password";
  process.env.FIRSTSTEP_ADMIN_PASSWORD_HASH = hashAdminPassword("a-strong-owner-password", Buffer.alloc(16, 7));
  try {
    assert.equal(verifyAdminPassword("a-strong-owner-password"), true);
    assert.equal(verifyAdminPassword("wrong-password"), false);
    delete process.env.FIRSTSTEP_ADMIN_PASSWORD_HASH;
    assert.throws(() => verifyAdminPassword("legacy-plaintext-password"), /PASSWORD_HASH/);
  } finally {
    restoreEnvironment("FIRSTSTEP_ADMIN_PASSWORD", previousPassword);
    restoreEnvironment("FIRSTSTEP_ADMIN_PASSWORD_HASH", previousHash);
    restoreEnvironment("NODE_ENV", previousNodeEnv);
    restoreEnvironment("FIRSTSTEP_ADMIN_REQUIRE_PASSWORD_HASH", previousRequirement);
  }
});

test("production MFA fails closed and validates authenticator codes", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRequirement = process.env.FIRSTSTEP_ADMIN_REQUIRE_MFA;
  const previousSecret = process.env.FIRSTSTEP_ADMIN_TOTP_SECRET;
  const now = 59_000;
  process.env.NODE_ENV = "production";
  process.env.FIRSTSTEP_ADMIN_REQUIRE_MFA = "true";
  process.env.FIRSTSTEP_ADMIN_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  try {
    assert.equal(isAdminMfaRequired(), true);
    assert.equal(verifyAdminTotp("000000", now), false);
    assert.equal(verifyAdminTotp("287082", now), true);
    delete process.env.FIRSTSTEP_ADMIN_TOTP_SECRET;
    assert.throws(() => isAdminMfaRequired(), /TOTP_SECRET/);
  } finally {
    restoreEnvironment("NODE_ENV", previousNodeEnv);
    restoreEnvironment("FIRSTSTEP_ADMIN_REQUIRE_MFA", previousRequirement);
    restoreEnvironment("FIRSTSTEP_ADMIN_TOTP_SECRET", previousSecret);
  }
});

test("admin cookie is HTTP-only, same-site, and secure in production", () => {
  const cookie = createAdminCookie("signed-token", true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Priority=High/);
});

test("admin session cookie contains an opaque token and no login credentials", () => {
  const previousSecret = process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const token = createAdminSessionToken(Date.parse("2026-07-24T12:00:00Z"));
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["audience", "expires_at", "issued_at", "nonce", "version"],
    );
    const cookie = createAdminCookie(token, true);
    assert.equal(cookie.includes("a-strong-owner-password"), false);
    assert.equal(cookie.toLowerCase().includes("password"), false);
    assert.equal(cookie.toLowerCase().includes("otp"), false);
  } finally {
    restoreEnvironment("FIRSTSTEP_ADMIN_SESSION_SECRET", previousSecret);
  }
});

test("admin writes require the browser origin to match the request host", () => {
  const request = {
    headers: {
      origin: "https://1ststep.ai",
      host: "1ststep.ai",
    },
  };
  assert.equal(isSameOriginRequest(request), true);
  request.headers.origin = "https://example.com";
  assert.equal(isSameOriginRequest(request), false);
  delete request.headers.origin;
  assert.equal(isSameOriginRequest(request), false);
});

test("mobile TOTP-only admin login is mobile-scoped and can be disabled", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRequirement = process.env.FIRSTSTEP_ADMIN_REQUIRE_MFA;
  const previousSecret = process.env.FIRSTSTEP_ADMIN_TOTP_SECRET;
  const previousMobileToggle = process.env.FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN;
  const mobileRequest = {
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
    },
  };
  const desktopRequest = {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  };
  process.env.NODE_ENV = "production";
  process.env.FIRSTSTEP_ADMIN_REQUIRE_MFA = "true";
  process.env.FIRSTSTEP_ADMIN_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  process.env.FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN = "true";
  try {
    assert.equal(isMobileAdminTotpLoginAllowed(mobileRequest), true);
    assert.equal(isMobileAdminTotpLoginAllowed(desktopRequest), false);
    process.env.FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN = "false";
    assert.equal(isMobileAdminTotpLoginAllowed(mobileRequest), false);
  } finally {
    restoreEnvironment("NODE_ENV", previousNodeEnv);
    restoreEnvironment("FIRSTSTEP_ADMIN_REQUIRE_MFA", previousRequirement);
    restoreEnvironment("FIRSTSTEP_ADMIN_TOTP_SECRET", previousSecret);
    restoreEnvironment("FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN", previousMobileToggle);
  }
});

test("local admin styles can load while the production response keeps inline styles blocked", () => {
  const adminHtml = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const adminHeaders = vercel.headers.find((entry) => entry.source === "/admin/(.*)")?.headers || [];
  const productionCsp = adminHeaders.find((header) => header.key === "Content-Security-Policy")?.value || "";

  assert.match(adminHtml, /style-src 'self' 'unsafe-inline'/);
  assert.match(productionCsp, /style-src 'self'/);
  assert.doesNotMatch(productionCsp, /style-src[^;]*'unsafe-inline'/);
});
