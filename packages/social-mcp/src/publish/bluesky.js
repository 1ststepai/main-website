import { mcpError } from "../errors.js";

const PDS = "https://bsky.social";

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function createSession({ identifier, appPassword, fetchImpl }) {
  const response = await fetchImpl(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.accessJwt || !payload.did) {
    throw mcpError("bluesky_auth_failed", payload?.message || "Bluesky login failed. Check handle and app password.", 502);
  }
  return payload;
}

export async function connectBlueskyAccount({ handle, appPassword, fetchImpl = fetch }) {
  const identifier = String(handle || "").trim().replace(/^@/, "");
  const password = String(appPassword || "").trim();
  if (!identifier || !password) {
    throw mcpError("invalid_bluesky", "Bluesky handle and app password are required.", 400);
  }
  const session = await createSession({ identifier, appPassword: password, fetchImpl });
  return {
    record: {
      platform: "bluesky",
      account_label: `@${identifier}`,
      did: String(session.did).slice(0, 120),
      handle: identifier.slice(0, 120),
    },
    secrets: {
      identifier,
      app_password: password,
      access_jwt: session.accessJwt,
      refresh_jwt: session.refreshJwt || "",
      did: session.did,
    },
  };
}

export async function publishBlueskyPost({ post, secrets, fetchImpl = fetch, onSecrets }) {
  if (!secrets?.identifier || !secrets?.app_password) {
    throw mcpError("bluesky_not_connected", "Connect Bluesky with a handle and app password.", 409);
  }
  const session = await createSession({
    identifier: secrets.identifier,
    appPassword: secrets.app_password,
    fetchImpl,
  });
  if (onSecrets) {
    await onSecrets({
      ...secrets,
      access_jwt: session.accessJwt,
      refresh_jwt: session.refreshJwt || secrets.refresh_jwt || "",
      did: session.did,
    });
  }
  const text = String(post.caption || post.description || post.title || "").slice(0, 300);
  if (!text) throw mcpError("invalid_post", "Bluesky posts need caption or description text.", 400);

  const response = await fetchImpl(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.accessJwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
      },
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.uri) {
    throw mcpError("bluesky_publish_failed", payload?.message || "Bluesky publish failed.", 502);
  }
  const rkey = String(payload.uri).split("/").pop();
  const handle = secrets.handle || secrets.identifier;
  return {
    platform_post_id: String(payload.uri),
    published_url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null,
  };
}
