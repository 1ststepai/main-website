export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ATTRIBUTION_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "first_touch_source",
  "first_touch_campaign",
  "landing_path",
]);

export function trimField(value, maximum = 254) {
  return String(value || "").trim().slice(0, maximum);
}

export function singleLineField(value, maximum = 254) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

export function requireJsonObject(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "request body must be a JSON object";
  }
  return "";
}

export function rejectUnexpectedFields(payload, allowedFields) {
  const unexpected = Object.keys(payload).filter((key) => !allowedFields.has(key));
  return unexpected.length ? `unexpected fields: ${unexpected.join(", ")}` : "";
}

export function attributionMustBeObject(payload) {
  return payload.attribution !== undefined && (
    !payload.attribution ||
    typeof payload.attribution !== "object" ||
    Array.isArray(payload.attribution)
  );
}

export function normalizeWebsiteUrl(value, clean = trimField) {
  const candidate = clean(value, 500);
  if (!candidate) return "";

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("website_url must be a valid website address");
  }
  url.hash = "";
  return url.toString();
}

export function normalizeAttribution(value, clean = trimField) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (!ATTRIBUTION_KEYS.has(key)) return result;
    const safeValue = clean(rawValue, 180);
    if (safeValue) result[key] = safeValue;
    return result;
  }, {});
}
