const WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 5000;
const buckets = globalThis.__socialRateLimitBuckets || new Map();
globalThis.__socialRateLimitBuckets = buckets;

function prune(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

export function resetSocialRateLimit() {
  buckets.clear();
}

export function checkSocialRateLimit(bucketKey, max = 60, now = Date.now()) {
  prune(now);
  const key = String(bucketKey || "anonymous");
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + WINDOW_MS };
  bucket.count += 1;
  buckets.set(key, bucket);
  const remaining = Math.max(0, max - bucket.count);
  return {
    allowed: bucket.count <= max,
    limit: max,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function setSocialRateHeaders(res, result) {
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) res.setHeader("Retry-After", String(result.retryAfterSeconds));
}
