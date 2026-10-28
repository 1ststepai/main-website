import { PLATFORMS } from "./platforms.js";

export const BUNDLE_STATUSES = ["draft", "scheduled", "partial", "complete", "discarded"];

export function defaultPresets() {
  return {
    platforms: ["youtube", "facebook", "instagram"],
    privacy_status: "private",
    hashtags: [],
    caption_footer: "",
  };
}

export function profileRequiresVidiq(profile) {
  if (!profile) return false;
  if (typeof profile.require_vidiq === "boolean") return profile.require_vidiq;
  return profile.id === "1ststep-ai";
}

export function knownPlatforms(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const key = String(item || "").trim();
    if (PLATFORMS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

export function draftTitle(input = {}) {
  const explicit = String(input.title || "").trim();
  if (explicit) return explicit.slice(0, 100);
  const youtubeTitle = String(input.overrides?.youtube?.title || "").trim();
  if (youtubeTitle) return youtubeTitle.slice(0, 100);
  return titleFromCaption(input.caption || input.description || "");
}

export function titleFromCaption(caption) {
  const text = String(caption || "")
    .replace(/#[^\s#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 100) return text;
  const cut = text.slice(0, 100);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

export function applyPresets(input = {}, presets = defaultPresets()) {
  const base = { ...defaultPresets(), ...(presets || {}) };
  const explicit = knownPlatforms(input.platforms);
  const platforms = explicit.length ? explicit : knownPlatforms(base.platforms);
  const sourceCaption = String(input.caption || input.description || "");
  let caption = sourceCaption;
  const footer = String(base.caption_footer || "").trim();
  if (footer && !caption.includes(footer)) {
    caption = caption ? `${caption}\n\n${footer}` : footer;
  }
  const tags = [];
  for (const tag of [...(Array.isArray(input.tags) ? input.tags : []), ...(base.hashtags || [])]) {
    const clean = String(tag || "").trim();
    if (clean && !tags.includes(clean)) tags.push(clean);
  }
  return {
    platforms,
    caption,
    description: String(input.description || caption),
    title: draftTitle({ title: input.title, caption: sourceCaption, overrides: input.overrides }),
    tags,
    privacy_status: ["private", "unlisted", "public"].includes(input.privacy_status)
      ? input.privacy_status
      : base.privacy_status || "private",
  };
}

export function childFields(bundle, platform) {
  const over = bundle.overrides?.[platform] || {};
  const shared = String(bundle.caption || bundle.description || "");
  const privacy =
    platform === "instagram"
      ? "public"
      : ["private", "unlisted", "public"].includes(over.privacy_status)
        ? over.privacy_status
        : platform === "facebook"
          ? over.privacy_status || "private"
          : bundle.privacy_status || "private";
  return {
    platform,
    title: String(over.title || bundle.title || shared).slice(0, 100),
    description: String(over.description || bundle.description || shared).slice(0, 5000),
    caption: String(over.caption || shared).slice(0, 2200),
    tags: Array.isArray(over.tags) ? over.tags : bundle.tags || [],
    privacy_status: privacy,
    media_path: bundle.media_assets?.[platform]?.path || bundle.media_path || null,
    media_url: bundle.media_url || null,
    media_content_type: bundle.media_assets?.[platform]?.content_type || bundle.media_content_type || "video/mp4",
    media_asset: bundle.media_assets?.[platform] || null,
    media_provenance: bundle.media_provenance || null,
    ai_generated: bundle.media_provenance?.ai_generated === true,
    bundle_id: bundle.id,
    source: bundle.source || "desk",
  };
}

export function rollupStatus(children) {
  const statuses = (children || []).map((row) => row?.status).filter(Boolean);
  if (!statuses.length) return "draft";
  if (statuses.every((status) => status === "scheduled")) return "scheduled";
  if (statuses.every((status) => status === "draft")) return "draft";
  if (statuses.every((status) => status === "published" || status === "handed_off")) return "complete";
  if (statuses.some((status) => ["published", "handed_off", "failed", "needs_review", "publishing"].includes(status))) {
    return "partial";
  }
  return "draft";
}

export function vidiqRecord(input = {}, nowIso) {
  const hasScore = input.score === 0 || (input.score !== undefined && input.score !== null && input.score !== "");
  if (!input.checked_at && !input.notes && !hasScore) return null;
  const checkedAt = String(input.checked_at || nowIso || "").trim();
  if (!checkedAt) return null;
  const score = hasScore ? Number(input.score) : null;
  return {
    score: Number.isFinite(score) ? score : null,
    notes: String(input.notes || "").slice(0, 2000),
    checked_at: checkedAt,
  };
}

function assetView(platform, asset, provenance = {}) {
  return {
    platform,
    label: asset?.label || platform,
    aspect: asset?.aspect || "",
    spec_ok: asset ? asset.spec_ok !== false : null,
    spec_message: asset?.spec_message || "",
    media_path: asset?.path || "",
    content_type: asset?.content_type || "",
    prompt: asset?.prompt || provenance?.prompt || "",
    provider: asset?.provider || provenance?.provider || "",
    model: asset?.model || provenance?.model || "",
  };
}

export function queueItems({ bundles = [], posts = [], profiles = [] } = {}) {
  const names = new Map(profiles.map((profile) => [profile.id, profile.name || profile.id]));
  const childIds = new Set();
  for (const bundle of bundles) {
    for (const id of Object.values(bundle.child_ids || {})) childIds.add(id);
  }
  const items = [];
  for (const bundle of bundles) {
    if (!["draft", "scheduled"].includes(bundle.status)) continue;
    const profile = profiles.find((row) => row.id === bundle.profile_id);
    const needsVidiq = bundle.platforms?.includes("youtube") && profileRequiresVidiq(profile) && !bundle.vidiq?.checked_at;
    items.push({
      kind: "bundle",
      id: bundle.id,
      profile_id: bundle.profile_id,
      profile_name: names.get(bundle.profile_id) || bundle.profile_id,
      title: bundle.title || bundle.caption || "Draft",
      caption: bundle.caption || "",
      platforms: (bundle.platforms || []).map((platform) => ({
        platform,
        post_id: bundle.child_ids?.[platform] || "",
        status: posts.find((post) => post.id === bundle.child_ids?.[platform])?.status || "draft",
      })),
      source: bundle.source || "desk",
      vidiq_needed: needsVidiq,
      instagram_needs_confirm: Boolean(bundle.platforms?.includes("instagram") && !bundle.instagram_public_confirmed),
      scheduled_at: bundle.scheduled_at || null,
      updated_at: bundle.updated_at,
      media_status: bundle.media_status || "",
      media_error: bundle.media_error || "",
      prompt: bundle.media_provenance?.prompt || bundle.media_request?.prompt || "",
      provider: bundle.media_provenance?.provider || bundle.media_request?.provider || "",
      model: bundle.media_provenance?.model || "",
      assets: (bundle.platforms || []).map((platform) => assetView(platform, bundle.media_assets?.[platform], bundle.media_provenance)),
    });
  }
  for (const post of posts) {
    if (!["draft", "scheduled"].includes(post.status)) continue;
    if (post.bundle_id || childIds.has(post.id)) continue;
    const profile = profiles.find((row) => row.id === post.profile_id);
    items.push({
      kind: "post",
      id: post.id,
      profile_id: post.profile_id,
      profile_name: names.get(post.profile_id) || post.profile_id,
      title: post.title || post.caption || post.id,
      caption: post.caption || post.description || "",
      platforms: [{ platform: post.platform, post_id: post.id, status: post.status }],
      source: post.source || "desk",
      vidiq_needed: post.platform === "youtube" && profileRequiresVidiq(profile) && !post.vidiq?.checked_at,
      instagram_needs_confirm: false,
      scheduled_at: post.scheduled_at || null,
      updated_at: post.updated_at,
      media_status: post.media_status || "",
      media_error: post.media_error || "",
      prompt: post.media_provenance?.prompt || post.media_request?.prompt || "",
      provider: post.media_provenance?.provider || post.media_request?.provider || "",
      model: post.media_provenance?.model || "",
      assets: post.media_asset ? [assetView(post.platform, post.media_asset, post.media_provenance)] : [],
    });
  }
  return items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}
