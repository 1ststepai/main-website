import { randomBytes } from "node:crypto";
import { mcpError } from "../errors.js";

/**
 * Shareable brand page. Owner opt-in, off by default, read-only.
 * Shows only approved, scheduled and posted items, with public links when a post is live.
 * Served by the local desk only; public hosting is not built and needs Evan's okay.
 */
const SHOWN = new Set(["approved", "scheduled", "published"]);
const SLUG_RE = /^[A-Za-z0-9_-]{24,64}$/;

export function brandPageSettings(store) {
  return store.readSection("brandPages");
}

export function enableBrandPage(store, { profile_id, now = Date.now() }) {
  if (!profile_id || !store.getProfile(profile_id)) throw mcpError("not_found", "Brand not found.", 404);
  return store.updateSection("brandPages", (pages) => {
    const current = pages[profile_id] || {};
    pages[profile_id] = {
      enabled: true,
      slug: current.slug || randomBytes(24).toString("base64url"),
      enabled_at: new Date(now).toISOString(),
    };
    return pages[profile_id];
  });
}

/** Off immediately. A new slug is minted next time it is turned on, so old links stay dead. */
export function disableBrandPage(store, { profile_id }) {
  return store.updateSection("brandPages", (pages) => {
    pages[profile_id] = { enabled: false, slug: null, enabled_at: null };
    return pages[profile_id];
  });
}

export function profileForSlug(store, slug) {
  if (!SLUG_RE.test(String(slug || ""))) return null;
  const pages = brandPageSettings(store);
  for (const [profileId, page] of Object.entries(pages)) {
    if (page?.enabled === true && page.slug === slug) return profileId;
  }
  return null;
}

function publicLink(post) {
  if (post.status !== "published") return null;
  const url = String(post.published_url || "");
  return /^https:\/\//.test(url) ? url : null;
}

function visible(post) {
  if (!SHOWN.has(post.status)) return false;
  if (post.platform === "youtube" && post.privacy_status !== "public") return false;
  if (post.platform === "facebook" && (post.status === "draft" || post.facebook_draft === true || post.unpublished === true)) return false;
  return true;
}

/** Whitelist only. Nothing private is copied; new post fields stay hidden unless added here. */
export function brandPageData(store, profileId) {
  const profile = store.getProfile(profileId);
  if (!profile) return null;
  const items = store
    .listPosts({ profileId })
    .filter((post) => post.profile_id === profileId && visible(post))
    .map((post) => ({
      platform: post.platform,
      title: String(post.title || ""),
      caption: String(post.caption || ""),
      status: post.status === "published" ? "posted" : post.status === "scheduled" ? "scheduled" : "approved",
      date: post.status === "published" ? post.published_at || post.updated_at || null : post.scheduled_at || null,
      link: publicLink(post),
    }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return { name: String(profile.name || profileId), items };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

const LABEL = { posted: "Posted", scheduled: "Scheduled", approved: "Approved" };

export function renderBrandPage(data) {
  const rows = data.items.length
    ? data.items
        .map(
          (item) => `<li class="item">
  <div class="meta"><span class="net">${esc(item.platform)}</span> · <span class="st st-${esc(item.status)}">${LABEL[item.status]}</span>${item.date ? ` · <time>${esc(String(item.date).slice(0, 10))}</time>` : ""}</div>
  ${item.title ? `<h2>${esc(item.title)}</h2>` : ""}
  <p>${esc(item.caption)}</p>
  ${item.link ? `<a href="${esc(item.link)}" rel="noopener noreferrer">View post</a>` : ""}
</li>`,
        )
        .join("\n")
    : `<li class="empty">Nothing shared yet.</li>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(data.name)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#0b1020;color:#e8ecf8}
main{max-width:720px;margin:0 auto;padding:32px 20px}
h1{margin:0 0 4px}.sub{color:#9aa6c4;margin:0 0 24px}
ul{list-style:none;padding:0;display:grid;gap:12px}
.item{border:1px solid #26304d;border-radius:14px;padding:14px 16px;background:#111831}
.item h2{font-size:1.05rem;margin:6px 0}.item p{margin:6px 0;white-space:pre-wrap}
.meta{color:#9aa6c4;font-size:.85rem}.net{text-transform:capitalize}
.st-posted{color:#7ee2a8}.st-scheduled{color:#ffd27a}.st-approved{color:#9cc3ff}
a{color:#8fb8ff}
</style></head>
<body><main>
<h1>${esc(data.name)}</h1>
<p class="sub">Approved, scheduled and posted content. Read-only.</p>
<ul>
${rows}
</ul>
</main></body></html>
`;
}
