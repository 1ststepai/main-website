import { PLATFORMS } from "./home.js";
import { mcpError } from "./errors.js";
import { resolveSafeMediaPath } from "./mediaPath.js";
import { createStore } from "./store.js";
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

const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "handed_off", "failed"];

function optionalMediaPath(value, mediaRoot) {
  if (value === undefined || value === null || value === "") return null;
  return resolveSafeMediaPath(String(value), mediaRoot);
}

export function createEngine({ home, env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const store = createStore({ home, env, now });
  const oauth = createOAuthRuntime({ store, env, fetchImpl });
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
      media_path: optionalMediaPath(input.media_path, mediaRoot),
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

  async function cancelScheduledPost({ post_id }) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    if (post.status !== "scheduled") {
      throw mcpError("invalid_status", "Only scheduled posts can be cancelled.", 409);
    }
    post.status = "draft";
    post.scheduled_at = null;
    post.updated_at = new Date(now()).toISOString();
    store.savePost(post);
    store.appendAudit({
      id: store.newId("aud"),
      at: post.updated_at,
      action: "schedule_cancelled",
      profile_id: post.profile_id,
      post_id: post.id,
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

  function assertPublishable(post, force) {
    if (!force && post.status === "scheduled" && post.scheduled_at && Date.parse(post.scheduled_at) > now()) {
      throw mcpError("not_due", "Post is scheduled for later. Pass force=true to publish now.", 409);
    }
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
      throw mcpError("invalid_status", `Cannot publish from status ${post.status}.`, 409);
    }
  }

  async function dispatchPublish(post, connection, secrets, config) {
    const onSecrets = async (next) => store.updateSecrets(post.profile_id, post.platform, next);
    if (post.platform === "youtube") {
      return publishYouTubeFromFile({
        post,
        mediaRoot,
        secrets,
        oauth: config.google,
        fetchImpl,
        onSecrets,
      });
    }
    if (post.platform === "tiktok") {
      return publishTikTokInboxFromFile({
        post,
        mediaRoot,
        secrets,
        oauth: config.tiktok,
        fetchImpl,
        onSecrets,
      });
    }
    if (post.platform === "instagram" || post.platform === "facebook") {
      return publishMetaReel({
        post,
        platform: post.platform,
        connection,
        secrets,
        fetchImpl,
      });
    }
    if (post.platform === "linkedin") {
      return publishLinkedInText({ post, connection, secrets, oauth: config.linkedin, fetchImpl, onSecrets });
    }
    if (post.platform === "x") {
      return publishXPost({ post, secrets, oauth: config.x, fetchImpl, onSecrets });
    }
    if (post.platform === "threads") {
      return publishThreadsPost({ post, connection, secrets, fetchImpl });
    }
    if (post.platform === "pinterest") {
      return publishPinterestPin({ post, connection, secrets, fetchImpl });
    }
    if (post.platform === "bluesky") {
      return publishBlueskyPost({ post, secrets, fetchImpl, onSecrets });
    }
    if (post.platform === "google_business") {
      return publishGoogleBusinessPost({
        post,
        connection,
        secrets,
        oauth: config.google,
        fetchImpl,
        onSecrets,
      });
    }
    if (post.platform === "reddit") {
      return publishRedditPost({ post, connection, secrets, oauth: config.reddit, fetchImpl, onSecrets });
    }
    if (post.platform === "snapchat") return publishSnapchatScaffold();
    if (post.platform === "whatsapp") return publishWhatsAppScaffold();
    throw mcpError("unsupported_platform", "Platform is not supported yet.");
  }

  async function publishPost({ post_id, force = false }) {
    const post = store.getPost(post_id);
    if (!post) throw mcpError("not_found", "Post not found.", 404);
    assertPublishable(post, force);

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
      const result = await dispatchPublish(post, connection, secrets, config);
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
    const settled = await Promise.allSettled(due.map((post) => publishPost({ post_id: post.id, force: true })));
    const results = settled.map((item, index) => {
      if (item.status === "fulfilled") return item.value;
      return {
        post_id: due[index].id,
        error: { code: item.reason?.code || "publish_failed", message: item.reason?.message || "Publish failed." },
      };
    });
    return { count: results.length, results };
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
    schedulePost,
    cancelScheduledPost,
    getPostStatus,
    listPosts,
    publishPost,
    publishDue,
    statuses: POST_STATUSES,
  };
}
