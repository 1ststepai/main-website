const DEFAULT_ALLOWED_ORIGINS = [
  "https://1ststep.ai",
  "https://www.1ststep.ai",
  "https://main-website-repo.vercel.app"
];

function header(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const direct = headers[name];
  if (direct !== undefined) {
    return direct;
  }

  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? headers[match] : undefined;
}

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function normalizedOrigin(value) {
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.origin;
  } catch (error) {
    return "";
  }
}

function configuredOrigins() {
  return String(process.env.APP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => normalizedOrigin(origin.trim()))
    .filter(Boolean);
}

function sameRequestOrigin(req) {
  const host = firstHeaderValue(header(req, "x-forwarded-host") || header(req, "host"));
  if (!host) {
    return "";
  }

  const forwardedProtocol = firstHeaderValue(header(req, "x-forwarded-proto"));
  const protocol = forwardedProtocol || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return normalizedOrigin(`${protocol}://${host}`);
}

function appendVary(res, value) {
  const existing = typeof res.getHeader === "function" ? res.getHeader("Vary") : "";
  const values = String(existing || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.includes(value)) {
    values.push(value);
  }
  res.setHeader("Vary", values.join(", "));
}

export function applyCors(req, res, { methods }) {
  const originHeader = firstHeaderValue(header(req, "origin"));
  const origin = normalizedOrigin(originHeader);
  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configuredOrigins(),
    sameRequestOrigin(req)
  ].filter(Boolean));

  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  res.setHeader("Access-Control-Max-Age", "600");
  appendVary(res, "Origin");

  if (!originHeader) {
    return true;
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  return true;
}

export function getRequestHeader(req, name) {
  return firstHeaderValue(header(req, name));
}
