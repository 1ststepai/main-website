import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminCookie,
  createAdminSessionToken,
  isSameOriginRequest,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "../lib/admin/auth.js";

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
    process.env.FIRSTSTEP_ADMIN_PASSWORD = previousPassword;
    process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("admin cookie is HTTP-only, same-site, and secure in production", () => {
  const cookie = createAdminCookie("signed-token", true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
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
