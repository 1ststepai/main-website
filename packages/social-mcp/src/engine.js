import { PLATFORMS } from "./home.js";
import { mcpError } from "./errors.js";
import { resolveSafeMediaPath } from "./mediaPath.js";
import { createStore, normalizeProfileId, POST_STATUSES } from "./store.js";
import { createOAuthRuntime } from "./oauth/server.js";
import { oauthConfig } from "./oauth/providers.js";
import { publishYouTubeFromFile } from "./publish/youtube.js";
import { publishTikTokInboxFromFile } from "./publish/tiktok.js";
import { publishMetaReel } from "./publish/meta.js";
import { publishLinkedInText } from "./publish/linkedin.js";
import { publishXPost } from "./publish/x.js";
import { publishThreadsPost } from "./publish/threads.js";
import { publishPinterestPin } from "./publish/pinterest.js";
import { connectBlueskyAccount, publishBlueskyPost } from "./publish/bluesky.js";
import { publishGoogleBusinessPost } from "./publish/google_business.js";
import { publishRedditPost } from "./publish/reddit.js";
import { publishSnapchatScaffold, publishWhatsAppScaffold } from "./publish/restricted.js";
import { validateDraftForPublish } from "./publish/validate.js";
import { displayOutcome, publishMode } from "./publish/outcome.js";
import { assertActionAllowed, assertProfileAllowed, getEntitlement } from "./license.js";
import {
  applyPresets,
  childFields,
  knownPlatforms,
  profileRequiresVidiq,
  queueItems,
  rollupStatus,
  vidiqRecord,
} from "./multiPost.js";

const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const DISPATCH_STARTED_MESSAGE =
  "Dispatch already started. PostPath cannot guarantee the platform did not accept the post, and it cannot undo it. The local row is not returned to draft and publish_due will not retry it.";

function isAuthExchange(url) {
  const value = String(url);
  return (
    value.includes("oauth2.googleapis.com/token") ||
    value.includes("/oauth/token") ||
    value.includes("/oauth/v2/accessToken") ||
    value.includes("/oauth2/token") ||
    value.includes("/api/v1/access_token") ||
    value.includes("refresh_access_token") ||
    value.includes("/oauth/access_token") ||
    value.includes("com.atproto.server.createSession") ||
    value.includes("com.atproto.server.refreshSession")
  );
}

function parseScheduledAt(value) {
  const raw = String(value || "").trim();
  if (!ISO_OFFSET.test(raw)) {
    throw mcpError(
      "invalid_schedule",
      "scheduled_at must be an ISO-8601 timestamp with a timezone offset (Z or ±hh:mm).",
    );
  }
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) {
    throw mcpError(
      "invalid_schedule",
      "scheduled_at must be an ISO-8601 timestamp with a timezone offset (Z or ±hh:mm).",
    );
  }
  return { when, iso: new Date(when).toISOString() };
}

function optionalMediaPath(value, mediaRoot) {
  if (value === undefined || value === null || value === "") return null;
  return resolveSafeMediaPath(String(value), mediaRoot);
}

export function createEngine({ home, env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const store = createStore({ home, env, now });
  const oauth = createOAuthRuntime({ store, env, fetchImpl });

  async function trackedFetch(url, init) {
    const method = String(init?.method || "GET").toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    const authExchange = isAuthExchange(url);
    try {
      const response = await fetchImpl(url, init);
      if (response?.status === 429) {
        throw mcpError("rate_limited", "Platform rate limit reached. Not retrying.", 429);
      }
      if (mutating && !authExchange && response?.status >= 500) {
        const error = mcpError(
          "dispatch_ambiguous",
          "The platform request was sent but the outcome is unknown.",
          502,
        );
        error.ambiguous = true;
        throw error;
      }
      return response;
    } catch (error) {
      if (error?.code === "rate_limited" || error?.ambiguous || error?.code === "dispatch_ambiguous") throw error;
      if (mutating && !authExchange) {
        const wrapped = mcpError(
          "dispatch_ambiguous",
          "The platform request was sent but the outcome is unknown.",
          502,
        );
        wrapped.ambiguous = true;
        throw wrapped;
      }
      throw error;
    }
  }
  const mediaRoot = store.homePaths.mediaDir;

  function requireProfile(profileId) {
    const profile = store.getProfile(profileId);
    if (!profile) throw mcpError("unknown_profile", "Unknown profile. Call upsert_profile first.");
    return profile;
  }

  function publicStatus() {
    return {
      home: store.homePaths.root,
      media_dir: mediaRoot,
      profiles: store.listProfiles(),
      connections: store.listConnections(),
      oauth_redirect_uri: oauth.redirectUri,
      google_redirect_uri: oauth.googleRedirectUri,
      publish_mode: publishMode(env),
      platforms: PLATFORMS,
    };
  }

  function rememberResult(working, source) {
    working.result_source = source || (publishMode(env) === "mock" ? "mock" : "platform");
    working.outcome = displayOutcome(working);
  }

  function mockPublish(post) {
    const forced = String(env.SOCIAL_MCP_MOCK_OUTCOME || "posted").trim().toLowerCase();
    if (forced === "rate_limited") {
      const error = mcpError("rate_limited", "Mock rate limit. Nothing was sent.", 429);
      error.result_source = "mock";
      throw error;
    }
    if (forced === "needs_review") {
      const error = mcpError("dispatch_ambiguous", "Mock uncertain result. Nothing was sent.", 502);
      error.ambiguous = true;
      error.result_source = "mock";
      throw error;
    }
    if (forced === "failed") {
      const error = mcpError("mock_failed", "Mock failure. Nothing was sent.", 502);
      error.result_source = "mock";
      throw error;
    }
    return {
      platform_post_id: `mock-${post.platform}`,
      published_url: null,
      result_source: "mock",
      note: "Mock result. Nothing was sent to the platform.",
    };
  }

  async function upsertProfile(input) {
    const profiles = store.listProfiles();
    const existing = store.getProfile(normalizeProfileId(input?.id));
    if (!existing) {
      const entitlement = getEntitlement(env);
      assertActionAllowed("create_profile", entitlement);
      assertProfileAllowed(profiles.length + 1, entitlement);
    }
    const profile = store.upsertProfile(input);
    store.appendAudit({
      id: store.newId("aud"),
      at: new Date(now()).toISOString(),
      action: "profile_upserted",
      profile_id: profile.id,
    });
    return { profile };
  }

  async function listAccounts(profileId) {
    if (profileId) requireProfile(profileId);
    return {
      profiles: store.listProfiles(),
      connections: store.listConnections(profileId),
    };
  }

  async function connectAccounts(profileId, options) {
    requireProfile(profileId);
    return oauth.connectAccounts(profileId, options);
  }

  async function connectBluesky(profileId, { handle, app_password } = {}) {
    requireProfile(profileId);
    const bundle = await connectBlueskyAccount({ handle, appPassword: app_password, fetchImpl });
    store.saveConnection({ profile_id: profileId, ...bundle.record }, bundle.secrets);
    store.appendAudit({
      id: store.newId("aud"),
      at: new Date(now()).toISOString(),
      action: "connected",
      profile_id: profileId,
      platform: "bluesky",
      detail: bundle.record.account_label,
    });
    return {
      profile_id: profileId,
      status: "complete",
      connection: store.getConnection(profileId, "bluesky"),
      message: "Bluesky connected with an app password.",
    };
  }

  function stampPost(fields, profile, source) {
    const stamp = new Date(now()).toISOString();
    return {
      id: store.newId("post"),
      profile_id: profile.id,
      status: "draft",
      scheduled_at: null,
      published_url: null,
      platform_post_id: null,
      error: null,
      created_at: stamp,
      updated_at: stamp,
      source: source || undefined,
      ...fields,
    };
  }

  async function createMultiDraft(input) {
    const profile = requireProfile(input.profile_id);
    const shaped = applyPresets(input, profile.presets);
    const platforms = knownPlatforms(shaped.platforms);
    if (!platforms.length) throw mcpError("invalid_platform", `Platform must be one of: ${PLATFORMS.join(", ")}`);
    const stamp = new Date(now()).toISOString();
    const source = input.source === "mcp" ? "mcp" : "desk";
    const bundle = {
      id: store.newId("bnd"),
      profile_id: profile.id,
      status: "draft",
      source,
      title: shaped.title,
      description: String(shaped.description || "").slice(0, 5000),
      caption: String(shaped.caption || "").slice(0, 2200),
      tags: shaped.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 30),
      privacy_status: shaped.privacy_status || "private",
      platforms,
      overrides: input.overrides && typeof input.overrides === "object" ? input.overrides : {},
      media_path: optionalMediaPath(input.media_path, mediaRoot),
      media_url: input.media_url ? String(input.media_url).slice(0, 2000) : null,
      media_content_type: String(input.media_content_type || "video/mp4").slice(0, 80),
      instagram_public_confirmed: input.instagram_public_confirmed === true,
      vidiq: vidiqRecord(input.vidiq || {}, stamp),
      child_ids: {},
      scheduled_at: null,
      created_at: stamp,
      updated_at: stamp,
    };
    if (input.facebook_public === true) {
      bundle.overrides = { ...bundle.overrides, facebook: { ...(bundle.overrides.facebook || {}), privacy_status: "public" } };
    }
    const posts = [];
    for (const platform of platforms) {
      const post = stampPost(childFields(bundle, platform), profile, source);
      if (bundle.vidiq) post.vidiq = bundle.vidiq;
      store.savePost(post, { create: true });
      bundle.child_ids[platform] = post.id;
      posts.push(post);
    }
    store.saveBundle(bundle);
    store.appendAudit({
      id: store.newId("aud"),
      at: stamp,
      action: "draft_created",
      profile_id: profile.id,
      post_id: bundle.id,
      platform: platforms.join(","),
      detail: source,
    });
    return { bundle, posts, post: posts[0] };
  }

  async function createDraft(input) {
    if (Array.isArray(input?.platforms) && input.platforms.length) return createMultiDraft(input);
    const profile = requireProfile(input.profile_id);
    const platform = String(input.platform || "");
    if (!PLATFORMS.includes(platform)) throw mcpError("invalid_platform", `Platform must be one of: ${PLATFORMS.join(", ")}`);
    const stamp = new Date(now()).toISOString();
    const post = {
      id: store.newId("post"),
      profile_id: profile.id,
      platform,
      status: "draft",
      title: String(input.title || "").slice(0, 100),
      description: String(input.description || "").slice(0, 5000),
      caption: String(input.caption || input.description || "").slice(0, 2200),
      tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 30) : [],
      privacy_status: ["private", "unlisted", "public"].includes(input.privacy_status) ? input.privacy_status : "private",
      media_path: optionalMediaPath(input.media_path, mediaRoot),
      media_url: input.media_url ? String(input.media_url).slice(0, 2000) : null,
      media_content_type: String(input.media_content_type || "video/mp4").slice(0, 80),
      source: input.source === "mcp" ? "mcp" : undefined,
      scheduled_at: null,
      published_url: null,
      platform_post_id: null,
      error: null,
      created_at: stamp,
      updated_at: stamp,
    };
    store.savePost(post, { create: true });
    store.appendAudit({
      id: store.newId("aud"),
      at: stamp,
      action: "draft_created",
      profile_id: profile.id,
      post_id: post.id,
      platform,
    });
    return { post };
  }

  async function updateDraft(input) {
    const post = store.getPost(input.post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", "Only draft, scheduled, or failed posts can be edited.", 409);
    }
    if (input.title !== undefined) post.title = String(input.title).slice(0, 100);
    if (input.description !== undefined) post.description = String(input.description).slice(0, 5000);
    if (input.caption !== undefined) post.caption = String(input.caption).slice(0, 2200);
    if (input.privacy_status !== undefined) post.privacy_status = input.privacy_status;
    if (input.media_content_type !== undefined) post.media_content_type = String(input.media_content_type).slice(0, 80);
    if (input.media_url !== undefined) post.media_url = input.media_url ? String(input.media_url).slice(0, 2000) : null;
    if (input.media_path !== undefined) post.media_path = optionalMediaPath(input.media_path, mediaRoot);
    if (Array.isArray(input.tags)) {
      post.tags = input.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 30);
    }
    post.updated_at = new Date(now()).toISOString();
    store.savePost(post);
    return { post };
  }

  async function schedulePost({ post_id, scheduled_at }) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", "Only draft, scheduled, or failed posts can be scheduled.", 409);
    }
    const { when, iso } = parseScheduledAt(scheduled_at);
    if (when < now() - 30_000) throw mcpError("invalid_schedule", "scheduled_at must be in the future.");
    const clash = store
      .listPosts({ profileId: post.profile_id, status: "scheduled" })
      .find((row) => row.id !== post.id && row.platform === post.platform && row.scheduled_at === iso);
    if (clash) {
      throw mcpError(
        "duplicate_schedule",
        `Another ${post.platform} post for this profile is already scheduled at ${iso}.`,
        409,
      );
    }
    post.scheduled_at = iso;
    post.status = "scheduled";
    post.updated_at = new Date(now()).toISOString();
    store.savePost(post);
    store.appendAudit({
      id: store.newId("aud"),
      at: post.updated_at,
      action: "scheduled",
      profile_id: post.profile_id,
      post_id: post.id,
      detail: post.scheduled_at,
    });
    return { post };
  }

  async function cancelScheduledPost({ post_id }) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (post.status === "publishing" || post.status === "needs_review" || store.isClaimed(post_id)) {
      throw mcpError("dispatch_started", DISPATCH_STARTED_MESSAGE, 409);
    }
    if (post.status !== "scheduled") {
      throw mcpError("invalid_status", "Only scheduled posts can be cancelled.", 409);
    }
    const result = store.compareAndSetPost(post_id, ["scheduled"], (row) => {
      row.status = "draft";
      row.scheduled_at = null;
    });
    if (!result.ok) {
      const current = store.getPost(post_id);
      if (!current) throw mcpError("not_found", "Post not found.", 404);
      if (current.status === "publishing" || current.status === "needs_review" || store.isClaimed(post_id)) {
        throw mcpError("dispatch_started", DISPATCH_STARTED_MESSAGE, 409);
      }
      throw mcpError("invalid_status", "Only scheduled posts can be cancelled.", 409);
    }
    store.appendAudit({
      id: store.newId("aud"),
      at: result.post.updated_at,
      action: "schedule_cancelled",
      profile_id: result.post.profile_id,
      post_id: result.post.id,
    });
    return { post: result.post };
  }

  async function getPostStatus(postId) {
    const post = store.getPost(postId);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    return { post };
  }

  async function listPosts(input = {}) {
    if (input.profile_id) requireProfile(input.profile_id);
    return { posts: store.listPosts({ profileId: input.profile_id, status: input.status }) };
  }

  function assertPublishable(post, force, acknowledge) {
    if (!force && post.status === "scheduled" && post.scheduled_at && Date.parse(post.scheduled_at) > now()) {
      throw mcpError("not_due", "Post is scheduled for later. Pass force=true to publish now.", 409);
    }
    if (post.status === "needs_review") {
      if (acknowledge !== true) {
        throw mcpError(
          "needs_review",
          "This post may already have been accepted. publish_due will not retry it. Pass acknowledge=true to publish_post after checking the platform.",
          409,
        );
      }
      return;
    }
    if (post.status === "publishing") {
      throw mcpError("dispatch_started", DISPATCH_STARTED_MESSAGE, 409);
    }
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", `Cannot publish from status ${post.status}.`, 409);
    }
  }

  function statusesFor(observedStatus) {
    if (observedStatus === "needs_review") return ["needs_review"];
    if (observedStatus === "scheduled") return ["scheduled"];
    if (observedStatus === "draft") return ["draft"];
    if (observedStatus === "failed") return ["failed"];
    return [];
  }

  async function dispatchPublish(post, connection, secrets, config) {
    if (publishMode(env) === "mock") return mockPublish(post);
    const onSecrets = async (next) => store.updateSecrets(post.profile_id, post.platform, next);
    const onNeedsReconnect = async () => {
      store.updateConnection(post.profile_id, post.platform, { status: "needs_reconnect" });
    };
    if (post.platform === "youtube") {
      return publishYouTubeFromFile({
        post,
        mediaRoot,
        secrets,
        oauth: config.google,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "tiktok") {
      return publishTikTokInboxFromFile({
        post,
        mediaRoot,
        secrets,
        oauth: config.tiktok,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "instagram" || post.platform === "facebook") {
      return publishMetaReel({
        post,
        platform: post.platform,
        connection,
        secrets,
        mediaRoot,
        fetchImpl: trackedFetch,
        onNeedsReconnect,
      });
    }
    if (post.platform === "linkedin") {
      return publishLinkedInText({
        post,
        connection,
        secrets,
        oauth: config.linkedin,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "x") {
      return publishXPost({
        post,
        secrets,
        oauth: config.x,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "threads") {
      return publishThreadsPost({
        post,
        connection,
        secrets,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "pinterest") {
      return publishPinterestPin({
        post,
        connection,
        secrets,
        oauth: config.pinterest,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "bluesky") {
      return publishBlueskyPost({
        post,
        secrets,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "google_business") {
      return publishGoogleBusinessPost({
        post,
        connection,
        secrets,
        oauth: config.google,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "reddit") {
      return publishRedditPost({
        post,
        connection,
        secrets,
        oauth: config.reddit,
        fetchImpl: trackedFetch,
        onSecrets,
        onNeedsReconnect,
      });
    }
    if (post.platform === "snapchat") return publishSnapchatScaffold();
    if (post.platform === "whatsapp") return publishWhatsAppScaffold();
    throw mcpError("unsupported_platform", "Platform is not supported yet.");
  }

  function quarantinePublishing(profileId) {
    const stuck = store.listPosts({ profileId, status: "publishing" });
    const ids = [];
    for (const row of stuck) {
      if (store.isClaimed(row.id)) continue;
      const live = store.getPost(row.id);
      if (!live || live.status !== "publishing") continue;
      live.status = "needs_review";
      live.error = {
        code: "dispatch_ambiguous",
        message:
          "Publish was already in progress. PostPath did not send it again because the platform may have accepted it.",
      };
      live.updated_at = new Date(now()).toISOString();
      store.savePost(live);
      ids.push(live.id);
    }
    return ids;
  }

  function settlePublishError(working, error) {
    const ambiguous = Boolean(error?.ambiguous) || error?.code === "dispatch_ambiguous";
    if (error?.revoked || error?.code === "invalid_grant" || error?.code === "needs_reconnect") {
      store.updateConnection(working.profile_id, working.platform, { status: "needs_reconnect" });
    }
    if (ambiguous) {
      working.status = "needs_review";
      working.error = {
        code: "dispatch_ambiguous",
        message:
          "The platform request may have been accepted. PostPath will not auto-retry. Pass acknowledge=true on publish_post only after you have checked the platform.",
      };
    } else if (error?.code === "rate_limited") {
      working.status = "failed";
      working.error = { code: "rate_limited", message: error.message || "Platform rate limit reached." };
    } else {
      working.status = "failed";
      working.error = { code: error.code || "publish_failed", message: error.message || "Publish failed." };
    }
    working.publish_note = "";
    rememberResult(working, error?.result_source);
    working.updated_at = new Date(now()).toISOString();
    store.savePost(working);
  }

  function assertYouTubeVidiq(post) {
    if (post.platform !== "youtube") return;
    const profile = store.getProfile(post.profile_id);
    if (!profileRequiresVidiq(profile)) return;
    const bundle = post.bundle_id ? store.getBundle(post.bundle_id) : null;
    const check = bundle?.vidiq || post.vidiq;
    if (!check?.checked_at) {
      throw mcpError(
        "vidiq_required",
        "YouTube needs a vidIQ check before this can be approved or published.",
        409,
      );
    }
  }

  function refreshBundle(bundleId) {
    const bundle = store.getBundle(bundleId);
    if (!bundle) return null;
    const children = Object.values(bundle.child_ids || {})
      .map((id) => store.getPost(id))
      .filter(Boolean);
    bundle.status = rollupStatus(children);
    bundle.updated_at = new Date(now()).toISOString();
    store.saveBundle(bundle);
    return bundle;
  }

  async function approveBundle({ bundle_id, scheduled_at, instagram_public_confirmed } = {}) {
    const bundle = store.getBundle(bundle_id);
    if (!bundle) throw mcpError("not_found", "Draft not found.", 404);
    if (!["draft", "scheduled", "partial"].includes(bundle.status)) {
      throw mcpError("invalid_status", "That draft can no longer be approved.", 409);
    }
    if (bundle.platforms?.includes("instagram")) {
      const confirmed = instagram_public_confirmed === true || bundle.instagram_public_confirmed === true;
      if (!confirmed) {
        throw mcpError(
          "instagram_confirm_required",
          "Instagram publishes as a public Reel. Confirm that on this post before approval.",
          409,
        );
      }
      bundle.instagram_public_confirmed = true;
      store.saveBundle(bundle);
    }
    const profile = store.getProfile(bundle.profile_id);
    if (bundle.platforms?.includes("youtube") && profileRequiresVidiq(profile) && !bundle.vidiq?.checked_at) {
      throw mcpError("vidiq_required", "YouTube needs a vidIQ check before this can be approved or published.", 409);
    }
    const children = (bundle.platforms || [])
      .map((platform) => store.getPost(bundle.child_ids?.[platform]))
      .filter(Boolean);
    if (scheduled_at) {
      const scheduled = [];
      const errors = [];
      for (const child of children) {
        try {
          scheduled.push(await schedulePost({ post_id: child.id, scheduled_at }));
        } catch (error) {
          errors.push({ ok: false, platform: child.platform, post_id: child.id, error: { code: error.code, message: error.message } });
        }
      }
      const saved = store.getBundle(bundle.id);
      const first = scheduled[0]?.post;
      if (first?.scheduled_at) saved.scheduled_at = first.scheduled_at;
      store.saveBundle(saved);
      const next = refreshBundle(bundle.id);
      return { bundle: next, scheduled: true, results: [...scheduled.map((row) => ({ ok: true, post: row.post })), ...errors] };
    }
    const results = [];
    for (const child of children) {
      try {
        const published = await publishPost({ post_id: child.id });
        results.push({ ok: true, platform: child.platform, post: published.post });
      } catch (error) {
        results.push({
          ok: false,
          platform: child.platform,
          post_id: child.id,
          error: { code: error.code || "publish_failed", message: error.message || "Publish failed." },
        });
      }
    }
    return { bundle: refreshBundle(bundle.id), results };
  }

  async function discardItem({ bundle_id, post_id } = {}) {
    if (bundle_id) {
      const bundle = store.getBundle(bundle_id);
      if (!bundle) throw mcpError("not_found", "Draft not found.", 404);
      for (const id of Object.values(bundle.child_ids || {})) {
        const child = store.getPost(id);
        if (child && ["draft", "scheduled", "failed"].includes(child.status)) store.deletePost(id);
      }
      bundle.status = "discarded";
      bundle.updated_at = new Date(now()).toISOString();
      store.saveBundle(bundle);
      return { discarded: true, bundle };
    }
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", "Only a draft, scheduled, or failed post can be discarded.", 409);
    }
    store.deletePost(post.id);
    return { discarded: true, post_id: post.id };
  }

  async function attachVidiqCheck(input = {}) {
    const record = vidiqRecord(input, new Date(now()).toISOString());
    if (!record) throw mcpError("invalid_vidiq", "vidIQ check needs checked_at or it is stamped now.", 400);
    if (!input.checked_at) record.checked_at = new Date(now()).toISOString();
    const bundle = input.bundle_id ? store.getBundle(input.bundle_id) : input.post_id ? store.getBundle(store.getPost(input.post_id)?.bundle_id) : null;
    if (bundle) {
      bundle.vidiq = record;
      bundle.updated_at = record.checked_at;
      store.saveBundle(bundle);
      const youtubeId = bundle.child_ids?.youtube;
      const youtube = youtubeId ? store.getPost(youtubeId) : null;
      if (youtube && ["draft", "scheduled", "failed"].includes(youtube.status)) {
        youtube.vidiq = record;
        youtube.updated_at = record.checked_at;
        store.savePost(youtube);
      }
      return { bundle, vidiq: record };
    }
    const post = store.getPost(input.post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    post.vidiq = record;
    post.updated_at = record.checked_at;
    store.savePost(post);
    return { post, vidiq: record };
  }

  function listQueue() {
    return {
      queue: queueItems({
        bundles: store.listBundles(),
        posts: store.listPosts(),
        profiles: store.listProfiles(),
      }),
    };
  }

  async function publishPost({ post_id, force = false, acknowledge = false, claimFrom = null } = {}) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    assertActionAllowed("publish", getEntitlement(env));
    assertYouTubeVidiq(post);
    assertPublishable(post, force, acknowledge);
    if (claimFrom && !claimFrom.includes(post.status)) {
      return { post, skipped: "cancelled_before_dispatch" };
    }

    const validation = validateDraftForPublish(post);
    if (!validation.ok) {
      const error = mcpError("validation_failed", validation.errors.join(" "), 400);
      error.details = { errors: validation.errors, warnings: validation.warnings };
      throw error;
    }

    const connection = store.getConnection(post.profile_id, post.platform);
    if (!connection) throw mcpError("not_connected", `${post.platform} is not connected for this profile.`, 409);
    const secrets = store.readSecrets(post.profile_id, post.platform);
    if (!secrets) throw mcpError("not_connected", `${post.platform} secrets are missing. Reconnect.`, 409);

    const from = claimFrom || statusesFor(post.status);
    await Promise.resolve();

    const claim = store.claimPost(post.id, from);
    if (!claim.ok) {
      const current = store.getPost(post_id);
      if (claim.reason === "in_flight" || current?.status === "publishing") {
        throw mcpError("dispatch_started", DISPATCH_STARTED_MESSAGE, 409);
      }
      if (current?.status === "draft" && from.includes("scheduled") && !from.includes("draft")) {
        if (claimFrom) return { post: current, skipped: "cancelled_before_dispatch" };
        throw mcpError("cancelled_before_dispatch", "Cancelled before dispatch. The post was not sent.", 409);
      }
      throw mcpError("invalid_status", `Cannot publish from status ${current?.status || "unknown"}.`, 409);
    }

    const working = claim.post;
    try {
      const config = oauthConfig(env, oauth.redirectUri);
      const result = await dispatchPublish(working, connection, secrets, config);
      working.platform_post_id = result.platform_post_id || null;
      working.published_url = result.published_url || null;
      working.status = result.handoff ? "handed_off" : "published";
      working.error = null;
      working.publish_note = result.note || "";
      if (result.privacy_status) working.privacy_status = result.privacy_status;
      rememberResult(working, result.result_source);
      working.updated_at = new Date(now()).toISOString();
      store.savePost(working);
      store.appendAudit({
        id: store.newId("aud"),
        at: working.updated_at,
        action: working.status,
        profile_id: working.profile_id,
        post_id: working.id,
        detail: result.note || working.published_url || working.platform_post_id,
      });
      return { post: working, result, warnings: validation.warnings };
    } catch (error) {
      settlePublishError(working, error);
      throw error;
    } finally {
      store.releaseClaim(working.id);
      if (working.bundle_id) refreshBundle(working.bundle_id);
    }
  }

  async function publishDue({ profile_id, limit = 5 } = {}) {
    const quarantined = quarantinePublishing(profile_id);
    const due = store
      .listPosts({ profileId: profile_id, status: "scheduled" })
      .filter((post) => post.scheduled_at && Date.parse(post.scheduled_at) <= now())
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
    await Promise.resolve();
    const settled = await Promise.allSettled(
      due.map((post) => publishPost({ post_id: post.id, force: true, claimFrom: ["scheduled"] })),
    );
    const results = [];
    settled.forEach((item, index) => {
      if (item.status === "fulfilled") {
        if (item.value?.skipped) return;
        results.push(item.value);
        return;
      }
      results.push({
        post_id: due[index].id,
        error: { code: item.reason?.code || "publish_failed", message: item.reason?.message || "Publish failed." },
      });
    });
    return { count: results.length, results, quarantined };
  }

  return {
    store,
    oauth,
    publicStatus,
    upsertProfile,
    listAccounts,
    connectAccounts,
    connectBluesky,
    createDraft,
    updateDraft,
    approveBundle,
    discardItem,
    attachVidiqCheck,
    listQueue,
    schedulePost,
    cancelScheduledPost,
    getPostStatus,
    listPosts,
    publishPost,
    publishDue,
    statuses: POST_STATUSES,
  };
}
