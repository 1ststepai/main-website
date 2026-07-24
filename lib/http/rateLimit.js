import { createHash } from "node:crypto";
import { getRequestHeader } from "./cors.js";

const DEFAULT_MAX_REQUESTS = 12;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
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

function prune(now) {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= MAX_BUCKETS) {
    buckets.delete(buckets.keys().next().value);
  }
}

function requestIdentifier(req) {
  const forwarded = getRequestHeader(req, "x-forwarded-for");
  const direct = getRequestHeader(req, "x-real-ip");
  const value = forwarded || direct || "unknown";
  return createHash("sha256").update(value).digest("hex");
}

export function checkRateLimit(req, scope = "default", now = Date.now()) {
  prune(now);
  const key = `${scope}:${requestIdentifier(req)}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  return {
    allowed: bucket.count <= MAX_REQUESTS,
    limit: MAX_REQUESTS,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

export function setRateLimitHeaders(res, result) {
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
  }
}
