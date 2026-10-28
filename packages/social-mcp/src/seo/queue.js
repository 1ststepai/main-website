import { mcpError } from "../errors.js";
import { normalizeProfileId } from "../store.js";
import { resolveChannels } from "./channels.js";
import { SEED_PRESETS, seedById } from "./seeds.js";

export async function queueDrafts(ctx, input = {}) {
  const topic = String(input.topic || "").trim().slice(0, 120);
  const groups = Array.isArray(input.brands) ? input.brands : [];
  if (!groups.length) throw mcpError("invalid_request", "Add at least one brand draft.");
  if (typeof ctx.createDraft !== "function") throw mcpError("seo_unavailable", "Draft saving is not available.", 503);
  const created = [];
  for (const group of groups) {
    const profileId = normalizeProfileId(group.profile_id);
    const seed = seedById(profileId);
    const name = String(group.name || seed?.name || profileId);
    if (!ctx.store.getProfile(profileId)) {
      ctx.store.upsertProfile({ id: profileId, name, presets: seed ? SEED_PRESETS : undefined });
    }
    const channels = (Array.isArray(group.channels) ? group.channels : []).filter((row) => {
      const known = resolveChannels([row.platform])[0];
      return known && !known.copyOnly && row.include !== false;
    });
    if (!channels.length) {
      created.push({ profile_id: profileId, queued: false, reason: "No publishable channel in this draft." });
      continue;
    }
    const overrides = {};
    const onScreen = {};
    for (const row of channels) {
      overrides[row.platform] = {
        title: row.title,
        description: row.description,
        caption: row.caption,
        tags: row.hashtags || row.tags || [],
      };
      if (row.on_screen_text) onScreen[row.platform] = String(row.on_screen_text).slice(0, 80);
    }
    const youtube = channels.find((row) => row.platform === "youtube") || channels[0];
    const draft = await ctx.createDraft({
      profile_id: profileId,
      platforms: channels.map((row) => row.platform),
      title: youtube.title,
      description: youtube.description,
      caption: youtube.caption,
      tags: youtube.hashtags || youtube.tags || [],
      privacy_status: "private",
      overrides,
      source: input.source || "desk",
    });
    if (draft.bundle) {
      draft.bundle.seo = {
        topic,
        on_screen: onScreen,
        drafted_at: new Date(ctx.now()).toISOString(),
        source: "seo_step",
      };
      draft.bundle.updated_at = draft.bundle.seo.drafted_at;
      ctx.store.saveBundle(draft.bundle);
    }
    created.push({ profile_id: profileId, queued: true, bundle: draft.bundle, posts: draft.posts });
  }
  return {
    topic,
    created,
    message: "Drafts are in the approval queue. Nothing is approved.",
    auto_approve: false,
  };
}
