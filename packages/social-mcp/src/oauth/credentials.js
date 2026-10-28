import { mcpError } from "../errors.js";

const GOOGLE_CLIENT_ID = /^[0-9]{6,}-[A-Za-z0-9_-]{8,}\.apps\.googleusercontent\.com$/;
const META_APP_ID = /^\d{8,}$/;
const PLACEHOLDER = /placeholder|changeme|your-secret|your_secret|todo|insert-here|<.*>/i;

function clean(value) {
  return String(value || "").trim();
}

export function assessOAuthValues(values = {}) {
  const google = [];
  const meta = [];
  const clientId = clean(values.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = clean(values.GOOGLE_OAUTH_CLIENT_SECRET);
  if (clientId || clientSecret) {
    if (!GOOGLE_CLIENT_ID.test(clientId)) {
      google.push(
        "GOOGLE_OAUTH_CLIENT_ID must be the Desktop client id from Google Cloud, like 123456789012-abc.apps.googleusercontent.com, with no spaces.",
      );
    }
    if (clientSecret.length < 10 || /\s/.test(clientSecret)) {
      google.push("GOOGLE_OAUTH_CLIENT_SECRET must be that client's secret, at least 10 characters, with no spaces.");
    } else if (PLACEHOLDER.test(clientSecret)) {
      google.push("GOOGLE_OAUTH_CLIENT_SECRET looks like a placeholder. Paste the secret from Google Cloud.");
    }
  }
  const appId = clean(values.META_APP_ID);
  const appSecret = clean(values.META_APP_SECRET);
  if (appId || appSecret) {
    if (!META_APP_ID.test(appId)) {
      meta.push("META_APP_ID must be the numeric App ID from the Meta app dashboard.");
    }
    if (appSecret.length < 10 || /\s/.test(appSecret)) {
      meta.push("META_APP_SECRET must be the App Secret, at least 10 characters, with no spaces.");
    } else if (PLACEHOLDER.test(appSecret)) {
      meta.push("META_APP_SECRET looks like a placeholder. Paste the secret from the Meta app dashboard.");
    }
  }
  return {
    google: { ok: google.length === 0, configured: Boolean(clientId && clientSecret && google.length === 0), errors: google },
    meta: { ok: meta.length === 0, configured: Boolean(appId && appSecret && meta.length === 0), errors: meta },
  };
}

export function assertOAuthValues(values) {
  const check = assessOAuthValues(values);
  const errors = [...check.google.errors, ...check.meta.errors];
  if (errors.length) {
    const error = mcpError("oauth_invalid", errors.join(" "), 400);
    error.details = check;
    throw error;
  }
  return check;
}
