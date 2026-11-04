#!/usr/bin/env node
/**
 * Per-platform live smoke check.
 *   node scripts/smoke.mjs --platform x            # dry run (default): app creds + token scopes, read-only
 *   node scripts/smoke.mjs --platform tiktok --private-post --media-url https://verified.example/v.mp4
 *
 * Dry run never posts. --private-post makes ONE private/unlisted post where the platform supports it
 * and refuses otherwise. Tokens come from SMOKE_<PLATFORM>_ACCESS_TOKEN env vars; values are never printed.
 */
const APP_ENV = {
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  youtube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};
const NEED_SCOPES = {
  x: ["tweet.write", "media.write", "offline.access"],
  pinterest: ["boards:read", "pins:write"],
  tiktok: ["video.publish"],
  youtube: ["https://www.googleapis.com/auth/youtube.upload"],
  instagram: ["instagram_content_publish"],
  facebook: ["pages_manage_posts"],
};

export function parseArgs(argv) {
  const out = { platform: null, privatePost: false, mediaUrl: null, board: null, pageId: null, igUserId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platform") out.platform = argv[++i];
    else if (a === "--private-post") out.privatePost = true;
    else if (a === "--media-url") out.mediaUrl = argv[++i];
    else if (a === "--board") out.board = argv[++i];
    else if (a === "--page-id") out.pageId = argv[++i];
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!APP_ENV[out.platform]) throw new Error(`--platform must be one of ${Object.keys(APP_ENV).join(", ")}`);
  return out;
}

async function json(res) {
  try { return await res.json(); } catch { return {}; }
}

/** Read-only scope probes. Each returns granted scope list (or null when the API does not say). */
const PROBES = {
  async x(token, f) {
    const r = await f("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${token}` } });
    return { ok: r.ok, status: r.status, scopes: null };
  },
  async pinterest(token, f) {
    const r = await f("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${token}` } });
    return { ok: r.ok, status: r.status, scopes: null };
  },
  async tiktok(token, f) {
    const r = await f("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    });
    const b = await json(r);
    return { ok: r.ok && (b?.error?.code || "ok") === "ok", status: r.status, scopes: null, privacy_options: b?.data?.privacy_level_options || null };
  },
  async youtube(token, f) {
    const r = await f(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    const b = await json(r);
    return { ok: r.ok, status: r.status, scopes: b.scope ? String(b.scope).split(" ") : null };
  },
  async instagram(token, f) {
    const r = await f("https://graph.facebook.com/v21.0/me/permissions", { headers: { Authorization: `Bearer ${token}` } });
    const b = await json(r);
    return { ok: r.ok, status: r.status, scopes: Array.isArray(b.data) ? b.data.filter((p) => p.status === "granted").map((p) => p.permission) : null };
  },
};
PROBES.facebook = PROBES.instagram;

const PRIVATE_POST = {
  async tiktok(token, f, o) {
    if (!/^https:\/\//.test(o.mediaUrl || "")) throw new Error("--media-url https://<verified domain>/video.mp4 required");
    const r = await f("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        post_info: { title: "PostPath smoke test", privacy_level: "SELF_ONLY", disable_comment: true },
        source_info: { source: "PULL_FROM_URL", video_url: o.mediaUrl },
      }),
    });
    const b = await json(r);
    return { ok: r.ok && (b?.error?.code || "ok") === "ok", status: r.status, privacy: "SELF_ONLY", error: b?.error?.code || null };
  },
  async pinterest(token, f, o) {
    if (!o.board) throw new Error("--board <secret board id> required");
    if (!/^https:\/\//.test(o.mediaUrl || "")) throw new Error("--media-url https://... image required");
    const auth = { Authorization: `Bearer ${token}` };
    const board = await json(await f(`https://api.pinterest.com/v5/boards/${encodeURIComponent(o.board)}`, { headers: auth }));
    if (board.privacy !== "SECRET") throw new Error("Refusing: board is not SECRET");
    const r = await f("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: o.board, title: "PostPath smoke test", media_source: { source_type: "image_url", url: o.mediaUrl } }),
    });
    return { ok: r.ok, status: r.status, privacy: "SECRET board" };
  },
  async facebook(token, f, o) {
    if (!o.pageId) throw new Error("--page-id required");
    const r = await f(`https://graph.facebook.com/v21.0/${encodeURIComponent(o.pageId)}/feed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "PostPath smoke test", published: false }),
    });
    return { ok: r.ok, status: r.status, privacy: "unpublished" };
  },
};
const NO_PRIVATE = {
  x: "X has no private or unlisted posts; smoke stays dry-run.",
  instagram: "Instagram has no private/unlisted feed or Reels publish; smoke stays dry-run.",
  youtube: "Use the PostPath desk with privacy_status=private for a YouTube upload; this script stays dry-run.",
};

export async function runSmoke(argv, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const o = parseArgs(argv);
  const report = { platform: o.platform, mode: o.privatePost ? "private-post" : "dry-run", app_env: {}, token: null, posted: false };
  for (const name of APP_ENV[o.platform]) report.app_env[name] = env[name] ? "set" : "missing";
  const token = env[`SMOKE_${o.platform.toUpperCase()}_ACCESS_TOKEN`];
  if (!token) {
    report.token = "missing (set SMOKE_" + o.platform.toUpperCase() + "_ACCESS_TOKEN to probe scopes)";
    return report;
  }
  const probe = await PROBES[o.platform](token, fetchImpl);
  report.token = probe.ok ? "valid" : `rejected (HTTP ${probe.status})`;
  if (probe.privacy_options) report.privacy_options = probe.privacy_options;
  if (probe.scopes) report.missing_scopes = NEED_SCOPES[o.platform].filter((s) => !probe.scopes.includes(s));
  if (!o.privatePost || !probe.ok) return report;
  if (NO_PRIVATE[o.platform]) {
    report.refused = NO_PRIVATE[o.platform];
    return report;
  }
  const result = await PRIVATE_POST[o.platform](token, fetchImpl, o);
  report.posted = result.ok;
  report.post = result;
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke(process.argv.slice(2))
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
