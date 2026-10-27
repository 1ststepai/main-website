import { mcpError } from "../errors.js";
import { invalidGrantError, isInvalidGrantPayload, sendWithRefresh } from "./authRetry.js";

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function refreshAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (!secrets.refresh_token) throw mcpError("gbp_not_connected", "Reconnect Google Business.", 409);
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: secrets.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("Google Business refresh token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("gbp_auth_failed", "Google Business needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  const next = await refreshAccess({ secrets, oauth, fetchImpl, now });
  if (onSecrets) await onSecrets(next);
  return next;
}

async function resolveParent(accessToken, connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect) {
  if (connection.location_name) return String(connection.location_name);
  const accountsSent = await sendWithRefresh({
    budget,
    secrets: secretsRef.current,
    refresh,
    onSecrets: async (next) => {
      secretsRef.current = next;
      if (onSecrets) await onSecrets(next);
    },
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { authorization: `Bearer ${current.access_token}` },
      }),
  });
  secretsRef.current = accountsSent.secrets;
  const accounts = accountsSent.response;
  const accountPayload = await readJson(accounts);
  const account = accountPayload.accounts?.[0]?.name;
  if (!accounts.ok || !account) {
    throw mcpError("gbp_location_required", "No Google Business account found for this Google login.", 409);
  }
  const locationsSent = await sendWithRefresh({
    budget,
    secrets: secretsRef.current,
    refresh,
    onSecrets: async (next) => {
      secretsRef.current = next;
      if (onSecrets) await onSecrets(next);
    },
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title`,
        { headers: { authorization: `Bearer ${current.access_token}` } },
      ),
  });
  secretsRef.current = locationsSent.secrets;
  const locations = locationsSent.response;
  const locationPayload = await readJson(locations);
  const location = locationPayload.locations?.[0]?.name;
  if (!locations.ok || !location) {
    throw mcpError("gbp_location_required", "No Google Business location found. Add a location in Google Business Profile first.", 409);
  }
  return location;
}

export async function publishGoogleBusinessPost({
  post,
  connection,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const budget = { used: false };
  const secretsRef = { current: fresh };
  const refresh = (current) => refreshAccess({ secrets: current, oauth, fetchImpl });
  const parent = connection.location_name
    ? String(connection.location_name)
    : await resolveParent(fresh.access_token, connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect);
  fresh = secretsRef.current;
  const summary = String(post.caption || post.description || post.title || "").slice(0, 1500);
  if (!summary) throw mcpError("invalid_post", "Google Business posts need caption or description text.", 400);

  const sent = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh,
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${current.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          languageCode: "en-US",
          summary,
          topicType: "STANDARD",
        }),
      }),
  });
  const response = sent.response;
  const payload = await readJson(response);
  if (!response.ok || !payload.name) {
    throw mcpError(
      "gbp_publish_failed",
      payload?.error?.message || "Google Business local post failed. Confirm Business Profile API access.",
      502,
    );
  }
  return {
    platform_post_id: String(payload.name),
    published_url: payload.searchUrl || null,
    note: "Google Business local post created.",
  };
}
