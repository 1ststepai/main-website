import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  getRateLimitPolicy,
  resetRateLimit,
  resolveClientIp,
  setRateLimitHeaders,
} from "../lib/http/rateLimit.js";

function req(headers = {}) {
  return { headers };
}

function res() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
  };
}

function uniqueScope(label = "test") {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test("default public policy still allows twelve requests in a ten-minute window", () => {
  const policy = getRateLimitPolicy("app-idea-checker");
  assert.equal(policy.limit, 12);
  assert.equal(policy.windowMs, 10 * 60 * 1000);
  assert.equal(policy.blockAfter, 24);
});

test("limits repeated requests without storing a raw IP address", () => {
  resetRateLimit();
  const request = req({ "x-real-ip": "203.0.113.40" });
  const scope = uniqueScope("store");
  let result;
  for (let index = 0; index < 13; index += 1) {
    result = checkRateLimit(request, scope);
  }
  assert.equal(result.allowed, false);
  assert.equal(result.blocked, false);
  assert.equal(result.remaining, 0);
  assert.ok(result.retryAfterSeconds > 0);
  assert.equal(result.ipHash.includes("203.0.113.40"), false);
  assert.match(result.ipHash, /^[a-f0-9]{64}$/);
});

test("prefers trusted platform IP headers over a spoofed X-Forwarded-For chain", () => {
  resetRateLimit();
  const scope = uniqueScope("spoof");
  const victim = req({
    "x-forwarded-for": "198.51.100.1, 203.0.113.50",
    "x-real-ip": "203.0.113.50",
  });
  const spoofed = req({
    "x-forwarded-for": "192.0.2.9",
    "x-real-ip": "203.0.113.50",
  });

  assert.deepEqual(resolveClientIp(victim), { ip: "203.0.113.50", source: "x-real-ip" });
  assert.deepEqual(resolveClientIp(spoofed), { ip: "203.0.113.50", source: "x-real-ip" });
  assert.equal(resolveClientIp(req({ "x-forwarded-for": "198.51.100.8, 203.0.113.77" })).ip, "203.0.113.77");

  for (let index = 0; index < 12; index += 1) {
    assert.equal(checkRateLimit(victim, scope).allowed, true);
  }
  const denied = checkRateLimit(spoofed, scope);
  assert.equal(denied.allowed, false);
  assert.equal(denied.ipHash, checkRateLimit(req({ "x-real-ip": "203.0.113.50" }), uniqueScope("hash-only")).ipHash);
});

test("uses x-vercel-forwarded-for when x-real-ip is absent", () => {
  const resolved = resolveClientIp(req({
    "x-forwarded-for": "198.51.100.2",
    "x-vercel-forwarded-for": "203.0.113.60",
  }));
  assert.deepEqual(resolved, { ip: "203.0.113.60", source: "x-vercel-forwarded-for" });
});

test("escalates from a short throttle to a temporary block and logs hashed metadata only", () => {
  resetRateLimit();
  const scope = uniqueScope("escalate");
  const request = req({ "x-real-ip": "203.0.113.90" });
  const start = 1_700_000_000_000;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));

  try {
    const options = { now: start, limit: 3, windowMs: 10_000, blockAfter: 5, blockMs: 30_000 };
    const firstDenied = Array.from({ length: 4 }, () => checkRateLimit(request, scope, options)).at(-1);
    assert.equal(firstDenied.allowed, false);
    assert.equal(firstDenied.blocked, false);
    assert.ok(firstDenied.retryAfterSeconds <= 10);

    const blocked = checkRateLimit(request, scope, options);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.blocked, true);
    assert.ok(blocked.retryAfterSeconds >= 29);

    const stillBlocked = checkRateLimit(request, scope, { ...options, now: start + 10_000 });
    assert.equal(stillBlocked.allowed, false);
    assert.equal(stillBlocked.blocked, true);

    const released = checkRateLimit(request, scope, { ...options, now: start + 30_001 });
    assert.equal(released.allowed, true);
    assert.equal(released.blocked, false);
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(warnings.length >= 2);
  for (const warning of warnings) {
    const payload = JSON.parse(warning);
    assert.ok(["rate_limited", "rate_limit_blocked"].includes(payload.event));
    assert.equal(payload.scope, scope);
    assert.match(payload.ip_hash, /^[a-f0-9]{64}$/);
    assert.equal(warning.includes("203.0.113.90"), false);
    assert.equal(warning.toLowerCase().includes("authorization"), false);
    assert.equal(warning.toLowerCase().includes("cookie"), false);
    assert.equal(warning.includes("secret"), false);
  }
  assert.ok(warnings.some((warning) => JSON.parse(warning).event === "rate_limit_blocked"));
});

test("sets Retry-After and RateLimit headers on a denied response", () => {
  resetRateLimit();
  const scope = uniqueScope("headers");
  const request = req({ "x-real-ip": "203.0.113.21" });
  let result;
  for (let index = 0; index < 13; index += 1) {
    result = checkRateLimit(request, scope);
  }
  const response = res();
  setRateLimitHeaders(response, result);
  assert.equal(response.headers.get("retry-after"), String(result.retryAfterSeconds));
  assert.equal(response.headers.get("ratelimit-limit"), "12");
  assert.equal(response.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(response.headers.get("ratelimit-reset")) > 0);
});
