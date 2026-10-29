import { mcpError } from "../errors.js";

const YT_FULL = ["https://www.googleapis.com/auth/youtube.force-ssl"];
const YT_UPLOAD = ["https://www.googleapis.com/auth/youtube.force-ssl"];
const FB_POSTS = ["pages_manage_posts", "pages_read_engagement"];
const FB_META = ["pages_manage_metadata"];
const FB_ENGAGE = ["pages_manage_engagement", "pages_read_user_content"];
const IG_COMMENTS = ["instagram_manage_comments"];
const X_WRITE = ["tweet.read", "tweet.write", "users.read"];

function str(value, name, { max = 5000, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw mcpError("invalid_request", `${name} is required.`, 400);
    return undefined;
  }
  const text = String(value);
  if (text.length > max) throw mcpError("invalid_request", `${name} is longer than ${max} characters.`, 400);
  return text;
}

function id(value, name) {
  const text = str(value, name, { max: 200 });
  if (!/^[A-Za-z0-9_.:@-]+$/.test(text)) throw mcpError("invalid_request", `${name} has unexpected characters.`, 400);
  return text;
}

function privacy(value, required = true) {
  if (value === undefined && !required) return undefined;
  if (!["public", "unlisted", "private"].includes(value)) {
    throw mcpError("invalid_request", "privacy_status must be public, unlisted or private.", 400);
  }
  return value;
}

function bool(value, name) {
  if (typeof value !== "boolean") throw mcpError("invalid_request", `${name} must be true or false.`, 400);
  return value;
}

function atLeastOne(out, keys) {
  if (!keys.some((key) => out[key] !== undefined)) {
    throw mcpError("invalid_request", `Set at least one of: ${keys.join(", ")}.`, 400);
  }
  return out;
}

function mediaList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) throw mcpError("invalid_request", "media_paths is a list of up to 4 files.", 400);
  return value.map((item) => str(item, "media_paths item", { max: 400 }));
}

/**
 * Every account change PostPath can make. Each one is queued as a draft action and
 * runs only after the owner approves it in the desk. destructive actions need a
 * second, typed confirmation.
 */
export const MANAGE_ACTIONS = {
  "youtube.update_channel": {
    platform: "youtube",
    label: "Update channel description and keywords",
    scopes: YT_FULL,
    validate: (p) => atLeastOne({ description: str(p.description, "description", { max: 1000, required: false }), keywords: str(p.keywords, "keywords", { max: 500, required: false }) }, ["description", "keywords"]),
    summary: (p) => `Change the YouTube channel ${[p.description !== undefined && "description", p.keywords !== undefined && "keywords"].filter(Boolean).join(" and ")}`,
  },
  "youtube.upload_banner": {
    platform: "youtube",
    label: "Upload channel banner",
    scopes: YT_UPLOAD,
    validate: (p) => ({ media_path: str(p.media_path, "media_path", { max: 400 }) }),
    summary: () => "Replace the YouTube channel banner",
  },
  "youtube.create_playlist": {
    platform: "youtube",
    label: "Create playlist",
    scopes: YT_FULL,
    validate: (p) => ({ title: str(p.title, "title", { max: 150 }), description: str(p.description, "description", { required: false }), privacy_status: privacy(p.privacy_status ?? "private") }),
    summary: (p) => `Create ${p.privacy_status} playlist "${p.title}"`,
  },
  "youtube.update_playlist": {
    platform: "youtube",
    label: "Update playlist",
    scopes: YT_FULL,
    validate: (p) => atLeastOne({ playlist_id: id(p.playlist_id, "playlist_id"), title: str(p.title, "title", { max: 150, required: false }), description: str(p.description, "description", { required: false }), privacy_status: privacy(p.privacy_status, false) }, ["title", "description", "privacy_status"]),
    summary: (p) => `Update playlist ${p.playlist_id}`,
  },
  "youtube.delete_playlist": {
    platform: "youtube",
    label: "Delete playlist",
    scopes: YT_FULL,
    destructive: true,
    validate: (p) => ({ playlist_id: id(p.playlist_id, "playlist_id") }),
    summary: (p) => `Delete playlist ${p.playlist_id}`,
  },
  "youtube.add_playlist_item": {
    platform: "youtube",
    label: "Add video to playlist",
    scopes: YT_FULL,
    validate: (p) => ({ playlist_id: id(p.playlist_id, "playlist_id"), video_id: id(p.video_id, "video_id"), position: p.position === undefined ? undefined : Math.max(0, Number.parseInt(p.position, 10) || 0) }),
    summary: (p) => `Add video ${p.video_id} to playlist ${p.playlist_id}`,
  },
  "youtube.remove_playlist_item": {
    platform: "youtube",
    label: "Remove video from playlist",
    scopes: YT_FULL,
    destructive: true,
    validate: (p) => ({ playlist_item_id: id(p.playlist_item_id, "playlist_item_id") }),
    summary: (p) => `Remove playlist item ${p.playlist_item_id}`,
  },
  "youtube.update_video": {
    platform: "youtube",
    label: "Edit video details",
    scopes: YT_FULL,
    validate: (p) => {
      const tags = p.tags === undefined ? undefined : Array.isArray(p.tags) ? p.tags.map((tag) => str(tag, "tag", { max: 100 })).slice(0, 50) : (() => { throw mcpError("invalid_request", "tags must be a list.", 400); })();
      return atLeastOne({ video_id: id(p.video_id, "video_id"), title: str(p.title, "title", { max: 100, required: false }), description: str(p.description, "description", { required: false }), tags, category_id: p.category_id === undefined ? undefined : id(String(p.category_id), "category_id") }, ["title", "description", "tags", "category_id"]);
    },
    summary: (p) => `Edit video ${p.video_id} (${["title", "description", "tags", "category_id"].filter((key) => p[key] !== undefined).join(", ")})`,
  },
  "youtube.set_visibility": {
    platform: "youtube",
    label: "Change video visibility",
    scopes: YT_FULL,
    destructive: (p) => p.privacy_status !== "public",
    validate: (p) => ({ video_id: id(p.video_id, "video_id"), privacy_status: privacy(p.privacy_status) }),
    summary: (p) => `Make video ${p.video_id} ${p.privacy_status}`,
  },
  "youtube.delete_video": {
    platform: "youtube",
    label: "Delete video",
    scopes: YT_FULL,
    destructive: true,
    validate: (p) => ({ video_id: id(p.video_id, "video_id") }),
    summary: (p) => `Permanently delete YouTube video ${p.video_id}`,
  },

  "facebook.edit_post": {
    platform: "facebook",
    label: "Edit Page post text",
    scopes: FB_POSTS,
    validate: (p) => ({ post_id: id(p.post_id, "post_id"), message: str(p.message, "message", { max: 63206 }) }),
    summary: (p) => `Edit Facebook Page post ${p.post_id}`,
  },
  "facebook.delete_post": {
    platform: "facebook",
    label: "Delete Page post",
    scopes: FB_POSTS,
    destructive: true,
    validate: (p) => ({ post_id: id(p.post_id, "post_id") }),
    summary: (p) => `Delete Facebook Page post ${p.post_id}`,
  },
  "facebook.update_page": {
    platform: "facebook",
    label: "Update Page about and website",
    scopes: FB_META,
    validate: (p) => atLeastOne({ about: str(p.about, "about", { max: 255, required: false }), description: str(p.description, "description", { max: 5000, required: false }), website: str(p.website, "website", { max: 500, required: false }) }, ["about", "description", "website"]),
    summary: (p) => `Update Facebook Page ${["about", "description", "website"].filter((key) => p[key] !== undefined).join(", ")}`,
  },
  "facebook.comment_hide": {
    platform: "facebook",
    label: "Hide or unhide a Page comment",
    scopes: FB_ENGAGE,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id"), hidden: bool(p.hidden ?? true, "hidden") }),
    summary: (p) => `${p.hidden ? "Hide" : "Unhide"} Facebook comment ${p.comment_id}`,
  },
  "facebook.comment_delete": {
    platform: "facebook",
    label: "Delete a Page comment",
    scopes: FB_ENGAGE,
    destructive: true,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id") }),
    summary: (p) => `Delete Facebook comment ${p.comment_id}`,
  },
  "facebook.comment_reply": {
    platform: "facebook",
    label: "Reply to a Page comment",
    scopes: FB_ENGAGE,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id"), message: str(p.message, "message", { max: 8000 }) }),
    summary: (p) => `Reply to Facebook comment ${p.comment_id}`,
  },

  "instagram.comment_hide": {
    platform: "instagram",
    label: "Hide or unhide an Instagram comment",
    scopes: IG_COMMENTS,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id"), hidden: bool(p.hidden ?? true, "hidden") }),
    summary: (p) => `${p.hidden ? "Hide" : "Unhide"} Instagram comment ${p.comment_id}`,
  },
  "instagram.comment_delete": {
    platform: "instagram",
    label: "Delete an Instagram comment",
    scopes: IG_COMMENTS,
    destructive: true,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id") }),
    summary: (p) => `Delete Instagram comment ${p.comment_id}`,
  },
  "instagram.comment_reply": {
    platform: "instagram",
    label: "Reply to an Instagram comment",
    scopes: IG_COMMENTS,
    validate: (p) => ({ comment_id: id(p.comment_id, "comment_id"), message: str(p.message, "message", { max: 2200 }) }),
    summary: (p) => `Reply to Instagram comment ${p.comment_id}`,
  },
  "instagram.set_comments_enabled": {
    platform: "instagram",
    label: "Turn comments on or off for a post",
    scopes: IG_COMMENTS,
    validate: (p) => ({ media_id: id(p.media_id, "media_id"), enabled: bool(p.enabled, "enabled") }),
    summary: (p) => `Turn comments ${p.enabled ? "on" : "off"} for Instagram post ${p.media_id}`,
  },

  "x.create_post": {
    platform: "x",
    label: "Post on X",
    scopes: X_WRITE,
    validate: (p) => {
      const out = { text: str(p.text, "text", { max: 280 }), media_paths: mediaList(p.media_paths) };
      return out;
    },
    extraScopes: (p) => (p.media_paths?.length ? ["media.write"] : []),
    summary: (p) => `Post on X: "${String(p.text).slice(0, 60)}"${p.media_paths?.length ? ` with ${p.media_paths.length} file(s)` : ""}`,
  },
  "x.reply": {
    platform: "x",
    label: "Reply on X",
    scopes: X_WRITE,
    validate: (p) => ({ in_reply_to: id(p.in_reply_to, "in_reply_to"), text: str(p.text, "text", { max: 280 }), media_paths: mediaList(p.media_paths) }),
    extraScopes: (p) => (p.media_paths?.length ? ["media.write"] : []),
    summary: (p) => `Reply to X post ${p.in_reply_to}`,
  },
  "x.delete_post": {
    platform: "x",
    label: "Delete your X post",
    scopes: X_WRITE,
    destructive: true,
    validate: (p) => ({ tweet_id: id(p.tweet_id, "tweet_id") }),
    summary: (p) => `Delete X post ${p.tweet_id}`,
  },
  "x.like": {
    platform: "x",
    label: "Like an X post",
    scopes: ["like.write", "users.read", "tweet.read"],
    validate: (p) => ({ tweet_id: id(p.tweet_id, "tweet_id") }),
    summary: (p) => `Like X post ${p.tweet_id}`,
  },
  "x.follow": {
    platform: "x",
    label: "Follow an X account",
    scopes: ["follows.write", "users.read", "tweet.read"],
    validate: (p) => {
      const out = { username: p.username ? id(String(p.username).replace(/^@/, ""), "username") : undefined, user_id: p.user_id ? id(p.user_id, "user_id") : undefined };
      return atLeastOne(out, ["username", "user_id"]);
    },
    summary: (p) => `Follow ${p.username ? `@${p.username}` : `X user ${p.user_id}`}`,
  },
};

export const MANAGE_ACTION_TYPES = Object.keys(MANAGE_ACTIONS);

export function actionSpec(type) {
  const spec = MANAGE_ACTIONS[type];
  if (!spec) throw mcpError("invalid_action", `Unknown account action: ${type}.`, 400);
  return spec;
}

export function isDestructive(type, params = {}) {
  const flag = actionSpec(type).destructive;
  return typeof flag === "function" ? Boolean(flag(params)) : Boolean(flag);
}

export function requiredScopes(type, params = {}) {
  const spec = actionSpec(type);
  return [...spec.scopes, ...(spec.extraScopes ? spec.extraScopes(params) : [])];
}

/** What each network's API will not let PostPath do. Shown in the desk and the docs. */
export const API_LIMITS = {
  youtube: [
    "Profile picture, channel name and handle cannot be changed through the YouTube Data API. Use YouTube Studio.",
    "A video file cannot be replaced after upload. Upload a new video instead.",
    "Deleting a video or playlist is permanent. YouTube has no undo.",
    "Every write spends YouTube Data API quota (the default project quota is 10,000 units per day). Check the quota calculator in the Google Cloud console before bulk edits.",
  ],
  facebook: [
    "Only text (message) of a Page post can be edited. Photos and video on an existing post cannot be swapped.",
    "Some Page fields (name, username, category) cannot be changed through the Graph API. Pages on the new Pages experience may ignore description; about and website are the reliable fields.",
    "Ads, Reels insights by viewer and Messenger inbox are not part of PostPath.",
  ],
  instagram: [
    "Instagram posts cannot be edited through the Graph API: not the caption, media, or location. PostPath can only turn comments on or off for a post.",
    "Instagram posts cannot be deleted through the Graph API. Delete them in the Instagram app.",
    "Instagram profile bio, name, picture and links cannot be changed through any API.",
    "Comment moderation works on comments on your own posts only.",
  ],
  x: [
    "Profile bio, name, picture and banner cannot be changed with OAuth 2.0 user tokens. X only offers that on the older v1.1 API with OAuth 1.0a, which PostPath does not use.",
    "Posts cannot be edited through the API. Delete and post again.",
    "Write access, likes, follows and media upload depend on your X developer plan and its limits. Check the X developer portal for what your plan includes and costs.",
  ],
};
