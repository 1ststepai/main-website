import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORMS } from "./home.js";
import { mcpError } from "./errors.js";
import { createStore } from "./store.js";
import { createOAuthRuntime } from "./oauth/server.js";
import { oauthConfig } from "./oauth/providers.js";
import { publishYouTubeFromFile } from "./publish/youtube.js";
import { publishTikTokInboxFromFile } from "./publish/tiktok.js";
import { publishMetaReel } from "./publish/meta.js";

const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "handed_off", "failed"];

export function createEngine({ home, env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const store = createStore({ home, env, now });
  const oauth = createOAuthRuntime({ store, env, fetchImpl });

  function requireProfile(profileId) {
    const profile = store.getProfile(profileId);
    if (!profile) throw mcpError("unknown_profile", "Unknown profile. Call upsert_profile first.");
    return profile;
  }

  function publicStatus() {
    return {
      home: store.homePaths.root,
      profiles: store.listProfiles(),
      connections: store.listConnections(),
      oauth_redirect_uri: oauth.redirectUri,
      platforms: PLATFORMS,
    };
  }

  async function upsertProfile(input) {
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

  async function createDraft(input) {
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
      media_path: input.media_path ? resolve(String(input.media_path)) : null,
      media_url: input.media_url ? String(input.media_url).slice(0, 2000) : null,
      media_content_type: String(input.media_content_type || "video/mp4").slice(0, 80),
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
    const fields = ["title", "description", "caption", "privacy_status", "media_path", "media_url", "media_content_type"];
    for (const field of fields) {
      if (input[field] === undefined) continue;
      if (field === "media_path") post.media_path = input.media_path ? resolve(String(input.media_path)) : null;
      else if (field === "tags" && Array.isArray(input.tags)) post.tags = input.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 30);
      else post[field] = input[field];
    }
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
    const when = Date.parse(String(scheduled_at || ""));
    if (!Number.isFinite(when)) throw mcpError("invalid_schedule", "scheduled_at must be an ISO timestamp.");
    if (when < now() - 30_000) throw mcpError("invalid_schedule", "scheduled_at must be in the future.");
    post.scheduled_at = new Date(when).toISOString();
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

  async function getPostStatus(postId) {
    const post = store.getPost(postId);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    return { post };
  }

  async function listPosts(input = {}) {
    if (input.profile_id) requireProfile(input.profile_id);
    return { posts: store.listPosts({ profileId: input.profile_id, status: input.status }) };
  }

  async function publishPost({ post_id, force = false }) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (!force && post.status === "scheduled" && post.scheduled_at && Date.parse(post.scheduled_at) > now()) {
      throw mcpError("not_due", "Post is scheduled for later. Pass force=true to publish now.", 409);
    }
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", `Cannot publish from status ${post.status}.`, 409);
    }
    const connection = store.getConnection(post.profile_id, post.platform);
    if (!connection) throw mcpError("not_connected", `${post.platform} is not connected for this profile.`, 409);
    const secrets = store.readSecrets(post.profile_id, post.platform);
    if (!secrets) throw mcpError("not_connected", `${post.platform} secrets are missing. Reconnect.`, 409);

    post.status = "publishing";
    post.error = null;
    post.updated_at = new Date(now()).toISOString();
    store.savePost(post);

    const config = oauthConfig(env, oauth.redirectUri);
    try {
      let result;
      if (post.platform === "youtube") {
        if (!post.media_path || !existsSync(post.media_path)) {
          throw mcpError("media_missing", "Set media_path to a local video file before publishing YouTube.");
        }
        result = await publishYouTubeFromFile({
          post,
          filePath: post.media_path,
          secrets,
          oauth: config.google,
          fetchImpl,
          onSecrets: async (next) => store.updateSecrets(post.profile_id, "youtube", next),
        });
      } else if (post.platform === "tiktok") {
        if (!post.media_path || !existsSync(post.media_path)) {
          throw mcpError("media_missing", "Set media to a local video file before publishing TikTok.");
        }
        result = await publishTikTokInboxFromFile({
          post,
          filePath: post.media_path,
          secrets,
          oauth: config.tiktok,
          fetchImpl,
          onSecrets: async (next) => store.updateSecrets(post.profile_id, "tiktok", next),
        });
      } else if (post.platform === "instagram" || post.platform === "facebook") {
        result = await publishMetaReel({
          post,
          platform: post.platform,
          connection,
          secrets,
          fetchImpl,
        });
      } else {
        throw mcpError("unsupported_platform", "Platform is not supported yet.");
      }

      post.platform_post_id = result.platform_post_id || null;
      post.published_url = result.published_url || null;
      post.status = result.handoff ? "handed_off" : "published";
      post.error = null;
      post.updated_at = new Date(now()).toISOString();
      store.savePost(post);
      store.appendAudit({
        id: store.newId("aud"),
        at: post.updated_at,
        action: post.status,
        profile_id: post.profile_id,
        post_id: post.id,
        detail: result.note || post.published_url || post.platform_post_id,
      });
      return { post, result };
    } catch (error) {
      post.status = "failed";
      post.error = { code: error.code || "publish_failed", message: error.message || "Publish failed." };
      post.updated_at = new Date(now()).toISOString();
      store.savePost(post);
      throw error;
    }
  }

  async function publishDue({ profile_id, limit = 5 } = {}) {
    const due = store
      .listPosts({ profileId: profile_id, status: "scheduled" })
      .filter((post) => post.scheduled_at && Date.parse(post.scheduled_at) <= now())
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
    const results = [];
    for (const post of due) {
      try {
        results.push(await publishPost({ post_id: post.id, force: true }));
      } catch (error) {
        results.push({ post_id: post.id, error: { code: error.code, message: error.message } });
      }
    }
    return { count: results.length, results };
  }

  return {
    store,
    oauth,
    publicStatus,
    upsertProfile,
    listAccounts,
    connectAccounts,
    createDraft,
    updateDraft,
    schedulePost,
    getPostStatus,
    listPosts,
    publishPost,
    publishDue,
    statuses: POST_STATUSES,
  };
}
