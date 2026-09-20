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

export function cleanText(value, maximum = 254) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

export function normalizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (!ATTRIBUTION_KEYS.has(key)) return result;
    const safeValue = cleanText(rawValue, 180);
    if (safeValue) result[key] = safeValue;
    return result;
  }, {});
}
