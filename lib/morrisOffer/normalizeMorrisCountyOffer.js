import { randomUUID } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ATTRIBUTION_KEYS = new Set([
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

export const MORRIS_COUNTY_MUNICIPALITIES = Object.freeze([
  "Boonton",
  "Boonton Township",
  "Butler",
  "Chatham Borough",
  "Chatham Township",
  "Chester Borough",
  "Chester Township",
  "Denville",
  "Dover",
  "East Hanover",
  "Florham Park",
  "Hanover Township",
  "Harding Township",
  "Jefferson Township",
  "Kinnelon",
  "Lincoln Park",
  "Long Hill Township",
  "Madison",
  "Mendham Borough",
  "Mendham Township",
  "Mine Hill Township",
  "Montville Township",
  "Morris Plains",
  "Morris Township",
  "Morristown",
  "Mount Arlington",
  "Mount Olive Township",
  "Mountain Lakes",
  "Netcong",
  "Parsippany-Troy Hills",
  "Pequannock Township",
  "Randolph",
  "Riverdale",
  "Rockaway Borough",
  "Rockaway Township",
  "Roxbury Township",
  "Victory Gardens",
  "Washington Township",
  "Wharton",
]);

const MORRIS_COUNTY_SET = new Set(MORRIS_COUNTY_MUNICIPALITIES);

function clean(value, maximum = 254) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizeWebsiteUrl(value) {
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

function normalizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (!ATTRIBUTION_KEYS.has(key)) return result;
    const safeValue = clean(rawValue, 180);
    if (safeValue) result[key] = safeValue;
    return result;
  }, {});
}

export function validateMorrisCountyOfferPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["request body must be a JSON object"];
  }

  const allowedFields = new Set([
    "contact_name",
    "business_name",
    "email",
    "town",
    "website_url",
    "project_goal",
    "eligibility_confirmed",
    "marketing_opt_in",
    "attribution",
  ]);
  const unexpected = Object.keys(payload).filter((key) => !allowedFields.has(key));
  if (unexpected.length) errors.push(`unexpected fields: ${unexpected.join(", ")}`);

  if (clean(payload.contact_name, 120).length < 2) {
    errors.push("contact_name is required");
  }
  if (clean(payload.business_name, 160).length < 2) {
    errors.push("business_name is required");
  }

  const email = clean(payload.email).toLowerCase();
  if (!email) errors.push("email is required");
  else if (!EMAIL_PATTERN.test(email)) errors.push("email must be a valid email address");

  if (!MORRIS_COUNTY_SET.has(clean(payload.town, 80))) {
    errors.push("town must be a Morris County municipality");
  }

  if (clean(payload.website_url, 500)) {
    try {
      normalizeWebsiteUrl(payload.website_url);
    } catch {
      errors.push("website_url must be a valid website address");
    }
  }

  const projectGoal = clean(payload.project_goal, 1200);
  if (projectGoal.length < 30) {
    errors.push("project_goal must include at least 30 characters");
  }
  if (payload.eligibility_confirmed !== true) {
    errors.push("eligibility must be confirmed");
  }
  if (payload.marketing_opt_in !== undefined && typeof payload.marketing_opt_in !== "boolean") {
    errors.push("marketing_opt_in must be a boolean");
  }
  if (payload.attribution !== undefined && (
    !payload.attribution ||
    typeof payload.attribution !== "object" ||
    Array.isArray(payload.attribution)
  )) {
    errors.push("attribution must be an object");
  }

  return errors;
}

export function normalizeMorrisCountyOffer(payload) {
  const errors = validateMorrisCountyOfferPayload(payload);
  if (errors.length) {
    const error = new Error("Invalid Morris County offer application");
    error.statusCode = 400;
    error.code = "invalid_morris_offer_application";
    error.errors = errors;
    throw error;
  }

  return {
    request_id: `morris_${randomUUID()}`,
    contact_name: clean(payload.contact_name, 120),
    business_name: clean(payload.business_name, 160),
    email: clean(payload.email).toLowerCase(),
    town: clean(payload.town, 80),
    website_url: normalizeWebsiteUrl(payload.website_url),
    project_goal: clean(payload.project_goal, 1200),
    eligibility_confirmed: true,
    marketing_opt_in: payload.marketing_opt_in === true,
    attribution: normalizeAttribution(payload.attribution),
    created_at: new Date().toISOString(),
  };
}
