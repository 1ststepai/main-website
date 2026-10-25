import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashApiToken(secret) {
  return createHash("sha256").update(String(secret), "utf8").digest("hex");
}

export function tokenHashesEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

export function generateApiToken() {
  const secret = `stp_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    token_hash: hashApiToken(secret),
    prefix: secret.slice(0, 12),
  };
}
