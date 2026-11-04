import { mcpError } from "../errors.js";
import { PLATFORMS } from "../home.js";
import { normalizeProfileId } from "../store.js";
import { defaultPresets, profileRequiresVidiq } from "../multiPost.js";
import { keywordRecord, keywordsFor } from "../seo/keywords.js";
import { buildVoiceRecord, voiceFor } from "../hook/voice.js";
import { readPilotFile } from "../pilot/config.js";
import { autoPostFor, recordAutoPostRequest } from "../autoPost.js";
import { learnedForContext } from "../learning.js";

const VOICE_FIELDS = ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"];

function blank(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

function pilotView(homePaths, profileId) {
  let config = null;
  try {
    config = readPilotFile(homePaths);
  } catch {
    config = null;
  }
  if (!config?.pilot_mode) return null;
  if (config.profile?.id && normalizeProfileId(config.profile.id) !== profileId) return { banner: config.compliance_banner || "", campaign: null };
  return {
    banner: config.compliance_banner || "",
    campaign: {
      name: config.campaign?.name || "",
      start: config.campaign?.start || "",
      end: config.campaign?.end || "",
      goals: (config.goals || []).map((goal) => ({
        id: goal.id,
        label: goal.label || "",
        topics: (goal.topics || []).map((topic) => ({ id: topic.id, title: topic.title || "" })),
      })),
    },
  };
}

/** What this connection may do with a draft. Never more than its scopes allow. */
export function connectionCan(scopes, pilot) {
  if (pilot) return "draft_only";
  if (scopes === null) return "approve_and_post";
  return Array.isArray(scopes) && scopes.includes("queue:approve") ? "approve_and_post" : "draft_only";
}

function contextFor(engine, profileId, { scopes, connectionId, pilot }) {
  const store = engine.store;
  const profile = store.getProfile(profileId);
  const presets = { ...defaultPresets(), ...(profile?.presets || {}) };
  const keywords = keywordsFor(store, profileId);
  const voice = voiceFor(store, profileId);
  const pilotInfo = pilot ? pilotView(store.homePaths, profileId) : null;
  const connected = store
    .listConnections(profileId)
    .map((row) => ({ platform: row.platform, account: row.account_label || row.display_name || row.account_name || "", status: row.status || "connected" }));
  const auto = autoPostFor(store, profileId, connectionId);

  const context = {
    identity: { id: profileId, name: profile?.name || keywords?.name || "", audience: keywords?.audience || "" },
    networks: {
      default_platforms: presets.platforms || [],
      privacy_status: presets.privacy_status || "private",
      connected,
    },
    voice: {
      tone: voice.tone || "",
      avoid: voice.avoid || [],
      on_camera_style: voice.on_camera_style || "",
      energy: voice.energy || "",
      appears_on_camera: voice.appears_on_camera ?? null,
      hashtags: presets.hashtags || [],
      caption_footer: presets.caption_footer || "",
    },
    topics: {
      keywords: {
        primary: keywords?.primary || [],
        secondary: keywords?.secondary || [],
        negative: keywords?.negative || [],
      },
      pilot_campaign: pilotInfo?.campaign || null,
    },
    rules: {
      require_vidiq: profile ? profileRequiresVidiq(profile) : profileId === "1ststep-ai",
      compliance_banner: pilot ? pilotInfo?.banner || "" : null,
      instagram_always_public: true,
      this_connection_can: connectionCan(scopes, pilot),
    },
    auto_post: {
      enabled: pilot ? false : auto.enabled === true,
      networks: pilot ? [] : auto.networks || [],
      connection_id: connectionId || null,
      enabled_at: pilot ? null : auto.enabled_at || null,
      pending_request: auto.pending_request || null,
    },
    imports: { enabled: false, note: "not built yet" },
    learned: learnedForContext(store, profileId),
  };

  const missing = [];
  if (!profile) missing.push("profile");
  if (blank(context.identity.audience)) missing.push("audience");
  for (const field of VOICE_FIELDS) if (blank(context.voice[field])) missing.push(field);
  if (blank(context.voice.hashtags)) missing.push("hashtags");
  if (blank(context.voice.caption_footer)) missing.push("caption_footer");
  if (blank(context.topics.keywords.primary)) missing.push("keywords.primary");
  if (!connected.length) missing.push("connected_accounts");
  context.missing = missing;
  context.status = !profile ? "not_set_up" : missing.length ? "partial" : "ready";
  return context;
}

/** Read-only. Blank fields come back blank and are listed in missing, never filled in. */
export function getBrandContext(engine, { profile_id, scopes = null, connectionId = null } = {}) {
  const pilot = engine.pilotOn ? engine.pilotOn() : false;
  const ids = profile_id
    ? [normalizeProfileId(profile_id)]
    : engine.store.listProfiles().map((profile) => profile.id);
  return { brands: ids.map((id) => contextFor(engine, id, { scopes, connectionId, pilot })) };
}

function list(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw mcpError("invalid_request", `${field} must be a list.`, 400);
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function validate(input) {
  const id = normalizeProfileId(input.profile_id);
  if (id.length < 2 || !/^[a-z0-9]/.test(id)) throw mcpError("invalid_profile", "profile_id must be 2–64 chars: letters, numbers, _ or -.", 400);
  const platforms = list(input.default_platforms, "default_platforms");
  const bad = (platforms || []).filter((item) => !PLATFORMS.includes(item));
  if (bad.length) throw mcpError("invalid_platform", `Unknown network: ${bad.join(", ")}.`, 400);
  if (input.privacy_status !== undefined && !["private", "unlisted", "public"].includes(input.privacy_status)) {
    throw mcpError("invalid_request", "privacy_status must be private, unlisted or public.", 400);
  }
  const voice = input.voice && typeof input.voice === "object" ? input.voice : undefined;
  if (voice?.avoid !== undefined) list(voice.avoid, "voice.avoid");
  const keywords = input.search_terms && typeof input.search_terms === "object" ? input.search_terms : undefined;
  for (const key of ["primary", "secondary", "negative"]) if (keywords?.[key] !== undefined) list(keywords[key], `search_terms.${key}`);
  return { id, platforms, voice, keywords, hashtags: list(input.hashtags, "hashtags") };
}

/**
 * One save for profile basics, presets, audience, keywords, voice and an optional auto-post request.
 * All or nothing. An auto-post request is only recorded as pending; the owner turns it on in the desk.
 */
export function saveBrandContext(engine, input = {}, { connectionId = null, scopes = null, pilot = false, now = Date.now() } = {}) {
  const store = engine.store;
  const clean = validate(input);
  const wantsAutoPost = Array.isArray(input.auto_post?.networks) && input.auto_post.networks.length > 0;
  if (wantsAutoPost && pilot) throw mcpError("pilot_auto_post_disabled", "Auto-post is off in pilot mode. Every draft waits for approval.", 403);
  const stamp = new Date(now).toISOString();
  store.atomic((db, tx) => {
    const existing = db.profiles[clean.id];
    const presets = { ...defaultPresets(), ...(existing?.presets || {}) };
    if (clean.platforms) presets.platforms = clean.platforms;
    if (input.privacy_status !== undefined) presets.privacy_status = input.privacy_status;
    if (clean.hashtags) presets.hashtags = clean.hashtags;
    if (input.caption_footer !== undefined) presets.caption_footer = String(input.caption_footer || "").slice(0, 500);
    tx.upsertProfile({
      id: clean.id,
      name: input.name,
      require_vidiq: typeof input.require_vidiq === "boolean" ? input.require_vidiq : undefined,
      presets,
    });
    db.seo = db.seo || {};
    if (clean.keywords || input.audience !== undefined) {
      const current = db.seo.keywords?.[clean.id] || keywordsFor(store, clean.id) || {};
      db.seo.keywords = db.seo.keywords || {};
      db.seo.keywords[clean.id] = keywordRecord(
        {
          id: clean.id,
          name: db.profiles[clean.id].name,
          audience: input.audience !== undefined ? input.audience : current.audience,
          primary: clean.keywords?.primary ?? current.primary,
          secondary: clean.keywords?.secondary ?? current.secondary,
          negative: clean.keywords?.negative ?? current.negative,
          site: current.site,
          source: "saved",
        },
        stamp,
      );
    }
    if (clean.voice) {
      const current = db.seo.voices?.[clean.id] || voiceFor(store, clean.id);
      db.seo.voices = db.seo.voices || {};
      db.seo.voices[clean.id] = buildVoiceRecord(current, { ...clean.voice, profile_id: clean.id, name: db.profiles[clean.id].name }, stamp);
    }
    if (wantsAutoPost) {
      db.autoPost = db.autoPost || {};
      recordAutoPostRequest(db.autoPost, {
        profile_id: clean.id,
        connection_id: connectionId,
        networks: input.auto_post.networks,
        requested_by: "assistant",
        at: stamp,
      });
    }
  });
  const saved = getBrandContext(engine, { profile_id: clean.id, scopes, connectionId }).brands[0];
  return {
    saved: true,
    brand: saved,
    auto_post_note: wantsAutoPost
      ? "Auto-post request saved as pending. It is NOT on. Only the owner can turn it on in the PostPath desk."
      : "Auto-post stays off.",
  };
}
