// Log redaction. Anything that can reach stdout, stderr, or the service journal goes
// through redactText so a token, sealed secret, or auth header is never written out.

const MARK = "[redacted]";

const SECRET_KEYS = new Set([
  "access_token",
  "refresh_token",
  "page_access_token",
  "id_token",
  "client_secret",
  "app_password",
  "password",
  "secrets",
  "secrets_enc",
  "secrets_aad",
  "token",
  "code_verifier",
  "owner_pin",
  "pin",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api_key",
  "apikey",
]);

const PATTERNS = [
  // PostPath's own tokens and sealed envelopes.
  /\bpp_(?:pat|at|rt|code)_[A-Za-z0-9_-]{8,}/g,
  /\bsmcp_enc_v1\.[A-Za-z0-9_.-]+/g,
  // Authorization headers and bearer/basic credentials.
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Google access and refresh tokens.
  /\bya29\.[A-Za-z0-9._-]{10,}/g,
  /\b1\/\/[A-Za-z0-9._-]{20,}/g,
  // Meta user and Page tokens.
  /\bEA[A-Za-z0-9]{30,}/g,
  // Common provider API keys.
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  // JWTs.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

// key=value / "key": "value" / key: value for secret-ish names.
const KEYED = /(["']?)\b(access_token|refresh_token|page_access_token|id_token|client_secret|app_password|password|code_verifier|owner_pin|api_key|apikey|authorization|x-api-key|cookie|set-cookie|token)\1(\s*[:=]\s*)(["']?)([^"'&\s,;}]+)/gi;

export function redactText(input) {
  if (input === null || input === undefined) return input;
  let text = typeof input === "string" ? input : String(input);
  text = text.replace(/\b((?:proxy-)?authorization\s*[:=]\s*)(?:(?:Bearer|Basic|Token)\s+)?[^\s'",;}]+/gi, (_m, head) => `${head}${MARK}`);
  text = text.replace(KEYED, (_m, q, key, sep, vq) => `${q}${key}${q}${sep}${vq}${MARK}`);
  for (const pattern of PATTERNS) {
    text = text.replace(pattern, (match, scheme) => (/^(Bearer|Basic)$/i.test(scheme || "") ? `${scheme} ${MARK}` : MARK));
  }
  return text;
}

/** Deep copy with secret-named keys replaced and string values scanned. */
export function redactValue(value, depth = 0) {
  if (depth > 20) return MARK;
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) {
    const out = new Error(redactText(value.message));
    out.name = value.name;
    if (value.code) out.code = value.code;
    if (value.stack) out.stack = redactText(value.stack);
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEYS.has(key.toLowerCase()) && item !== null && item !== undefined && item !== "" && typeof item !== "boolean" ? MARK : redactValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** Drop sealed or raw credential fields from an MCP payload, without touching other text. */
export function stripSecretFields(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripSecretFields(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (["secrets", "secrets_enc", "secrets_aad", "access_token", "refresh_token", "page_access_token", "id_token", "client_secret", "app_password", "code_verifier"].includes(key)) continue;
    out[key] = stripSecretFields(item, depth + 1);
  }
  return out;
}

let installed = false;

/** Route console output through redaction. Safe to call more than once. */
export function installLogRedaction(target = console) {
  if (installed && target === console) return;
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    const original = target[method]?.bind(target);
    if (!original) continue;
    target[method] = (...args) => original(...args.map((arg) => (typeof arg === "string" ? redactText(arg) : redactValue(arg))));
  }
  if (target === console) installed = true;
}
