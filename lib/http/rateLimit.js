import { createHash } from "node:crypto";
import { isIP } from "node:net";

const DEFAULT_MAX_REQUESTS = 12;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BLOCK_MS = 30 * 60 * 1000;
const MAX_BUCKETS = 5000;

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

const MAX_REQUESTS = boundedInteger("APP_IDEA_RATE_LIMIT_MAX", DEFAULT_MAX_REQUESTS, 1, 1000);
const WINDOW_MS = boundedInteger("APP_IDEA_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS, 1000, 24 * 60 * 60 * 1000);

const buckets = globalThis.__firststepRateLimitBuckets || new Map();
globalThis.__firststepRateLimitBuckets = buckets;

const SCOPE_POLICIES = {
  "admin-login": { limit: MAX_REQUESTS, windowMs: WINDOW_MS, blockAfter: 20, blockMs: DEFAULT_BLOCK_MS },
  "admin-read": { limit: 180, windowMs: WINDOW_MS, blockAfter: 300, blockMs: 15 * 60 * 1000 },
  "admin-write": { limit: 60, windowMs: WINDOW_MS, blockAfter: 90, blockMs: DEFAULT_BLOCK_MS },
  "admin-payments": { limit: 20, windowMs: WINDOW_MS, blockAfter: 30, blockMs: DEFAULT_BLOCK_MS },
  "admin-email": { limit: 20, windowMs: WINDOW_MS, blockAfter: 30, blockMs: DEFAULT_BLOCK_MS },
  "admin-pdf": { limit: 20, windowMs: WINDOW_MS, blockAfter: 30, blockMs: DEFAULT_BLOCK_MS },
  "booking-webhook": { limit: 60, windowMs: WINDOW_MS, blockAfter: 120, blockMs: 15 * 60 * 1000 },
  "google-reviews": { limit: 60, windowMs: WINDOW_MS, blockAfter: 120, blockMs: 15 * 60 * 1000 },
};

function defaultPolicy() {
  return {
    limit: MAX_REQUESTS,
    windowMs: WINDOW_MS,
    blockAfter: MAX_REQUESTS * 2,
    blockMs: DEFAULT_BLOCK_MS,
  };
}

export function getRateLimitPolicy(scope, overrides = {}) {
  const base = SCOPE_POLICIES[scope] || defaultPolicy();
  const limit = overrides.limit ?? base.limit;
  return {
    limit,
    windowMs: overrides.windowMs ?? base.windowMs,
    blockAfter: overrides.blockAfter ?? base.blockAfter ?? limit * 2,
    blockMs: overrides.blockMs ?? base.blockMs,
  };
}

function rawHeader(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  const value = match ? headers[match] : undefined;
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return value == null ? "" : String(value);
}

function firstValidIp(value) {
  for (const part of String(value || "").split(",")) {
    const candidate = part.trim();
    if (isIP(candidate)) {
      return candidate;
    }
  }
  return "";
}

function lastValidIp(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (isIP(parts[index])) {
      return parts[index];
    }
  }
  return "";
}

export function resolveClientIp(req) {
  const realIp = firstValidIp(rawHeader(req, "x-real-ip"));
  if (realIp) {
    return { ip: realIp, source: "x-real-ip" };
  }

  const vercelIp = firstValidIp(rawHeader(req, "x-vercel-forwarded-for"));
  if (vercelIp) {
    return { ip: vercelIp, source: "x-vercel-forwarded-for" };
  }

  const forwarded = lastValidIp(rawHeader(req, "x-forwarded-for"));
  if (forwarded) {
    return { ip: forwarded, source: "x-forwarded-for" };
  }

  return { ip: "unknown", source: "unknown" };
}

function requestIdentifier(req) {
  return createHash("sha256").update(resolveClientIp(req).ip).digest("hex");
}

function prune(now) {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now && (bucket.blockedUntil || 0) <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= MAX_BUCKETS) {
    buckets.delete(buckets.keys().next().value);
  }
}

function normalizeOptions(nowOrOptions) {
  if (nowOrOptions == null) {
    return { now: Date.now() };
  }
  if (typeof nowOrOptions === "number") {
    return { now: nowOrOptions };
  }
  return { now: nowOrOptions.now ?? Date.now(), ...nowOrOptions };
}

function logDenied(result, scope, source) {
  console.warn(JSON.stringify({
    event: result.blocked ? "rate_limit_blocked" : "rate_limited",
    scope,
    ip_hash: result.ipHash,
    ip_source: source,
    stage: result.blocked ? "block" : "throttle",
    count: result.count,
    limit: result.limit,
    retry_after_seconds: result.retryAfterSeconds,
  }));
}

export function resetRateLimit() {
  buckets.clear();
}

export function checkRateLimit(req, scope = "default", nowOrOptions = Date.now()) {
  const options = normalizeOptions(nowOrOptions);
  const now = options.now;
  const policy = getRateLimitPolicy(scope, options);
  const resolved = resolveClientIp(req);
  const ipHash = requestIdentifier(req);

  prune(now);
  const key = `${scope}:${ipHash}`;
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { count: 0, resetAt: now + policy.windowMs, blockedUntil: 0 };
  }

  if ((bucket.blockedUntil || 0) > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
    const result = {
      allowed: false,
      blocked: true,
      limit: policy.limit,
      remaining: 0,
      resetAt: bucket.blockedUntil,
      retryAfterSeconds,
      count: bucket.count,
      ipHash,
    };
    logDenied(result, scope, resolved.source);
    return result;
  }

  if (bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + policy.windowMs, blockedUntil: 0 };
  }

  bucket.count += 1;
  const exceeded = bucket.count > policy.limit;
  const blocked = exceeded && bucket.count >= policy.blockAfter;
  if (blocked) {
    bucket.blockedUntil = now + policy.blockMs;
  }
  buckets.set(key, bucket);

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((blocked ? bucket.blockedUntil : bucket.resetAt) - now) / 1000)
  );
  const result = {
    allowed: !exceeded,
    blocked,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: blocked ? bucket.blockedUntil : bucket.resetAt,
    retryAfterSeconds,
    count: bucket.count,
    ipHash,
  };

  if (!result.allowed) {
    logDenied(result, scope, resolved.source);
  }

  return result;
}

export function setRateLimitHeaders(res, result) {
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
  }
}

export function rejectIfRateLimited(req, res, scope, sendJson, message) {
  const result = checkRateLimit(req, scope);
  setRateLimitHeaders(res, result);
  if (result.allowed) {
    return false;
  }
  sendJson(res, 429, {
    ok: false,
    code: "rate_limited",
    message: message || "Too many requests. Wait and try again.",
  });
  return true;
}

