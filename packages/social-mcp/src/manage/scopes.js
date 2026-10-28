import { META_SCOPES, X_SCOPES, YOUTUBE_SCOPES } from "../oauth/providers.js";

/** Networks that have full account management in PostPath, and the sign-in provider that grants it. */
export const MANAGED_NETWORKS = {
  youtube: { provider: "youtube", label: "YouTube", required: YOUTUBE_SCOPES },
  facebook: { provider: "meta", label: "Facebook Page", required: META_SCOPES },
  instagram: { provider: "meta", label: "Instagram", required: META_SCOPES },
  x: { provider: "x", label: "X", required: X_SCOPES },
};

/** What a connection made before this release was granted. Used when a record has no granted_scopes. */
export const LEGACY_SCOPES = {
  youtube: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"],
  instagram: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"],
  x: ["tweet.read", "tweet.write", "users.read", "offline.access"],
};

const PLAIN = {
  "https://www.googleapis.com/auth/youtube.upload": "Upload videos",
  "https://www.googleapis.com/auth/youtube.readonly": "See your channel",
  "https://www.googleapis.com/auth/youtube.force-ssl": "Manage channel, playlists and videos (edit, unlist, delete)",
  pages_show_list: "List your Pages",
  pages_read_engagement: "Read Page posts and engagement",
  pages_manage_posts: "Create, edit and delete Page posts",
  instagram_basic: "Read Instagram profile and media",
  instagram_content_publish: "Publish to Instagram",
  business_management: "Find the business that owns the Page",
  pages_manage_engagement: "Hide, delete and reply to Page comments",
  pages_manage_metadata: "Update Page details (about, website)",
  pages_read_user_content: "Read comments people leave on the Page",
  read_insights: "Read Page insights",
  instagram_manage_comments: "Hide, delete and reply to Instagram comments",
  instagram_manage_insights: "Read Instagram insights",
  "tweet.read": "Read posts",
  "tweet.write": "Post, reply and delete your posts",
  "users.read": "Read your profile",
  "offline.access": "Stay signed in",
  "like.write": "Like posts",
  "follows.write": "Follow accounts",
  "media.write": "Upload images and video",
};

export function scopeLabel(scope) {
  return PLAIN[scope] || scope;
}

export function parseScopes(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "").split(/[\s,]+/).filter(Boolean);
}

/** Granted scopes for a connection record. Never reads secrets. */
export function grantedScopes(connection) {
  if (!connection) return [];
  if (Array.isArray(connection.granted_scopes)) return connection.granted_scopes;
  return LEGACY_SCOPES[connection.platform] || [];
}

export function accessStatus(store, profileId) {
  const rows = [];
  for (const [platform, meta] of Object.entries(MANAGED_NETWORKS)) {
    const connection = store.getConnection(profileId, platform);
    const granted = grantedScopes(connection);
    const missing = connection ? meta.required.filter((scope) => !granted.includes(scope)) : [...meta.required];
    rows.push({
      platform,
      label: meta.label,
      provider: meta.provider,
      connected: Boolean(connection),
      account_label: connection?.account_label || null,
      scopes_known: Boolean(connection && Array.isArray(connection.granted_scopes)),
      granted: meta.required.filter((scope) => granted.includes(scope)).map((scope) => ({ scope, label: scopeLabel(scope) })),
      missing: missing.map((scope) => ({ scope, label: scopeLabel(scope) })),
      full_access: Boolean(connection) && missing.length === 0,
      action: !connection ? "connect" : missing.length ? "reconnect" : "ok",
    });
  }
  return rows;
}

export function hasScopes(connection, scopes) {
  const granted = grantedScopes(connection);
  return scopes.filter((scope) => !granted.includes(scope));
}

/** Scopes to store on a fresh connection: what the token response reported, or what was requested. */
export function scopesForNewConnection(platform, reported) {
  const parsed = parseScopes(reported);
  if (parsed.length) return parsed;
  return [...(MANAGED_NETWORKS[platform]?.required || [])];
}
