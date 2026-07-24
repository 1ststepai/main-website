const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 2000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const entries = globalThis.__firststepIdempotencyEntries || new Map();
globalThis.__firststepIdempotencyEntries = entries;

function prune(now) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }

  while (entries.size >= MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}

export function validateIdempotencyKey(value) {
  if (!value) {
    return "";
  }
  if (!KEY_PATTERN.test(value)) {
    const error = new Error("Idempotency-Key must be 8 to 128 letters, numbers, dots, colons, underscores, or hyphens");
    error.statusCode = 400;
    error.code = "invalid_idempotency_key";
    throw error;
  }
  return value;
}

export async function runIdempotent(key, fingerprint, operation, now = Date.now()) {
  if (!key) {
    return { replayed: false, result: await operation() };
  }

  prune(now);
  const existing = entries.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      const error = new Error("Idempotency-Key was already used for a different request");
      error.statusCode = 409;
      error.code = "idempotency_conflict";
      throw error;
    }
    return { replayed: true, result: await existing.promise };
  }

  const promise = operation();
  entries.set(key, {
    expiresAt: now + IDEMPOTENCY_TTL_MS,
    fingerprint,
    promise
  });

  try {
    const result = await promise;
    if (result.statusCode >= 500) {
      entries.delete(key);
    }
    return { replayed: false, result };
  } catch (error) {
    entries.delete(key);
    throw error;
  }
}
