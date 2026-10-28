import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { readJson, sendWithRefresh } from "../publish/authRetry.js";
import { ensureAccess as ytEnsure, refreshAccess as ytRefresh } from "../publish/youtube.js";
import { ensureAccess as xEnsure, refreshAccess as xRefresh } from "../publish/x.js";

export const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";
export const META_GRAPH = "https://graph.facebook.com/v22.0";
export const X_API = "https://api.twitter.com/2";
export const X_MEDIA_API = "https://api.x.com/2/media/upload";

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const VIDEO_TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime" };

function fail(code, payload, fallback) {
  const message = payload?.error?.message || payload?.detail || payload?.title || payload?.errors?.[0]?.message || fallback;
  return mcpError(code, String(message).slice(0, 300), 502);
}

// ---------- YouTube ----------

function youtubeClient(ctx) {
  const budget = { used: false };
  let secrets = ctx.secrets;
  async function call(method, url, { json, body, headers = {} } = {}) {
    const ensured = await ytEnsure({ secrets, oauth: ctx.config.google, fetchImpl: ctx.fetchImpl });
    if (ensured !== secrets && ctx.onSecrets) await ctx.onSecrets(ensured);
    secrets = ensured;
    const sent = await sendWithRefresh({
      budget,
      secrets,
      refresh: (current) => ytRefresh({ secrets: current, oauth: ctx.config.google, fetchImpl: ctx.fetchImpl }),
      onSecrets: ctx.onSecrets,
      onNeedsReconnect: ctx.onNeedsReconnect,
      send: (current) =>
        ctx.fetchImpl(url, {
          method,
          headers: { authorization: `Bearer ${current.access_token}`, ...(json ? { "content-type": "application/json" } : {}), ...headers },
          body: json ? JSON.stringify(json) : body,
        }),
    });
    secrets = sent.secrets;
    const payload = await readJson(sent.response);
    if (!sent.response.ok) throw fail("youtube_manage_failed", payload, `YouTube returned ${sent.response.status}.`);
    return payload;
  }
  return { call };
}

async function channelBranding(yt, connection) {
  const query = connection.channel_id ? `id=${encodeURIComponent(connection.channel_id)}` : "mine=true";
  const payload = await yt.call("GET", `${YT_API}/channels?part=brandingSettings&${query}`);
  const channel = payload.items?.[0];
  if (!channel) throw mcpError("youtube_manage_failed", "YouTube did not return the channel.", 502);
  return channel;
}

async function putBranding(yt, channel, patch) {
  const branding = channel.brandingSettings || {};
  const body = {
    id: channel.id,
    brandingSettings: {
      ...branding,
      channel: { ...(branding.channel || {}), ...(patch.channel || {}) },
      image: { ...(branding.image || {}), ...(patch.image || {}) },
    },
  };
  if (!patch.image && !branding.image) delete body.brandingSettings.image;
  return yt.call("PUT", `${YT_API}/channels?part=brandingSettings`, { json: body });
}

const youtube = {
  async "youtube.update_channel"(ctx, p) {
    const yt = youtubeClient(ctx);
    const channel = await channelBranding(yt, ctx.connection);
    const change = {};
    if (p.description !== undefined) change.description = p.description;
    if (p.keywords !== undefined) change.keywords = p.keywords;
    await putBranding(yt, channel, { channel: change });
    return { channel_id: channel.id, url: `https://www.youtube.com/channel/${channel.id}` };
  },
  async "youtube.upload_banner"(ctx, p) {
    const file = resolveSafeMediaPath(p.media_path, ctx.mediaRoot);
    const type = IMAGE_TYPES[extname(file).toLowerCase()];
    if (!type || type === "image/webp" || type === "image/gif") throw mcpError("invalid_media", "The banner must be a PNG or JPEG.", 400);
    if (statSync(file).size > 6 * 1024 * 1024) throw mcpError("invalid_media", "YouTube banners must be 6 MB or less.", 400);
    const yt = youtubeClient(ctx);
    const uploaded = await yt.call("POST", `${YT_UPLOAD_API}/channelBanners/insert?uploadType=media`, { body: readFileSync(file), headers: { "content-type": type } });
    if (!uploaded.url) throw mcpError("youtube_manage_failed", "YouTube did not return a banner URL.", 502);
    const channel = await channelBranding(yt, ctx.connection);
    await putBranding(yt, channel, { image: { bannerExternalUrl: uploaded.url } });
    return { channel_id: channel.id, banner_url: uploaded.url };
  },
  async "youtube.create_playlist"(ctx, p) {
    const yt = youtubeClient(ctx);
    const out = await yt.call("POST", `${YT_API}/playlists?part=snippet,status`, {
      json: { snippet: { title: p.title, description: p.description || "" }, status: { privacyStatus: p.privacy_status } },
    });
    return { playlist_id: out.id, url: out.id ? `https://www.youtube.com/playlist?list=${out.id}` : null };
  },
  async "youtube.update_playlist"(ctx, p) {
    const yt = youtubeClient(ctx);
    const current = (await yt.call("GET", `${YT_API}/playlists?part=snippet,status&id=${encodeURIComponent(p.playlist_id)}`)).items?.[0];
    if (!current) throw mcpError("not_found", "YouTube did not find that playlist on this channel.", 404);
    const snippet = { title: p.title ?? current.snippet?.title, description: p.description ?? current.snippet?.description ?? "" };
    const status = { privacyStatus: p.privacy_status ?? current.status?.privacyStatus };
    await yt.call("PUT", `${YT_API}/playlists?part=snippet,status`, { json: { id: p.playlist_id, snippet, status } });
    return { playlist_id: p.playlist_id };
  },
  async "youtube.delete_playlist"(ctx, p) {
    await youtubeClient(ctx).call("DELETE", `${YT_API}/playlists?id=${encodeURIComponent(p.playlist_id)}`);
    return { playlist_id: p.playlist_id, deleted: true };
  },
  async "youtube.add_playlist_item"(ctx, p) {
    const snippet = { playlistId: p.playlist_id, resourceId: { kind: "youtube#video", videoId: p.video_id } };
    if (p.position !== undefined) snippet.position = p.position;
    const out = await youtubeClient(ctx).call("POST", `${YT_API}/playlistItems?part=snippet`, { json: { snippet } });
    return { playlist_item_id: out.id };
  },
  async "youtube.remove_playlist_item"(ctx, p) {
    await youtubeClient(ctx).call("DELETE", `${YT_API}/playlistItems?id=${encodeURIComponent(p.playlist_item_id)}`);
    return { playlist_item_id: p.playlist_item_id, removed: true };
  },
  async "youtube.update_video"(ctx, p) {
    const yt = youtubeClient(ctx);
    const current = (await yt.call("GET", `${YT_API}/videos?part=snippet&id=${encodeURIComponent(p.video_id)}`)).items?.[0];
    if (!current) throw mcpError("not_found", "YouTube did not find that video on this channel.", 404);
    const was = current.snippet || {};
    // videos.update replaces the whole snippet, so unchanged fields are sent back as they were.
    const snippet = {
      title: p.title ?? was.title,
      description: p.description ?? was.description ?? "",
      tags: p.tags ?? was.tags ?? [],
      categoryId: p.category_id ?? was.categoryId ?? "22",
    };
    if (was.defaultLanguage) snippet.defaultLanguage = was.defaultLanguage;
    await yt.call("PUT", `${YT_API}/videos?part=snippet`, { json: { id: p.video_id, snippet } });
    return { video_id: p.video_id, url: `https://www.youtube.com/watch?v=${p.video_id}` };
  },
  async "youtube.set_visibility"(ctx, p) {
    const yt = youtubeClient(ctx);
    const current = (await yt.call("GET", `${YT_API}/videos?part=status&id=${encodeURIComponent(p.video_id)}`)).items?.[0];
    if (!current) throw mcpError("not_found", "YouTube did not find that video on this channel.", 404);
    const status = { ...(current.status || {}), privacyStatus: p.privacy_status };
    for (const key of ["uploadStatus", "failureReason", "rejectionReason"]) delete status[key];
    if (p.privacy_status !== "private") delete status.publishAt;
    await yt.call("PUT", `${YT_API}/videos?part=status`, { json: { id: p.video_id, status } });
    return { video_id: p.video_id, privacy_status: p.privacy_status };
  },
  async "youtube.delete_video"(ctx, p) {
    await youtubeClient(ctx).call("DELETE", `${YT_API}/videos?id=${encodeURIComponent(p.video_id)}`);
    return { video_id: p.video_id, deleted: true };
  },
};

// ---------- Facebook Page and Instagram ----------

async function graph(ctx, method, path, params = {}) {
  const token = ctx.secrets.page_access_token;
  if (!token) throw mcpError("not_connected", "Reconnect Facebook and Instagram.", 409);
  const url = new URL(`${META_GRAPH}/${path}`);
  let body;
  if (method === "GET" || method === "DELETE") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set("access_token", token);
  } else {
    body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token });
  }
  const response = await ctx.fetchImpl(url.toString(), {
    method,
    headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {},
    body,
  });
  const payload = await readJson(response);
  if (response.status === 401 || payload?.error?.code === 190) {
    if (ctx.onNeedsReconnect) await ctx.onNeedsReconnect();
    throw mcpError("needs_reconnect", "Meta rejected the Page token. Reconnect Facebook and Instagram.", 401);
  }
  if (!response.ok || payload?.error) throw fail("meta_manage_failed", payload, `Meta returned ${response.status}.`);
  return payload;
}

const meta = {
  async "facebook.edit_post"(ctx, p) {
    await graph(ctx, "POST", encodeURIComponent(p.post_id), { message: p.message });
    return { post_id: p.post_id, url: `https://www.facebook.com/${p.post_id}` };
  },
  async "facebook.delete_post"(ctx, p) {
    await graph(ctx, "DELETE", encodeURIComponent(p.post_id));
    return { post_id: p.post_id, deleted: true };
  },
  async "facebook.update_page"(ctx, p) {
    const pageId = ctx.connection.page_id;
    if (!pageId) throw mcpError("not_connected", "The Facebook connection has no Page id. Reconnect.", 409);
    const fields = {};
    for (const key of ["about", "description", "website"]) if (p[key] !== undefined) fields[key] = p[key];
    await graph(ctx, "POST", encodeURIComponent(pageId), fields);
    return { page_id: pageId, updated: Object.keys(fields) };
  },
  async "facebook.comment_hide"(ctx, p) {
    await graph(ctx, "POST", encodeURIComponent(p.comment_id), { is_hidden: p.hidden });
    return { comment_id: p.comment_id, hidden: p.hidden };
  },
  async "facebook.comment_delete"(ctx, p) {
    await graph(ctx, "DELETE", encodeURIComponent(p.comment_id));
    return { comment_id: p.comment_id, deleted: true };
  },
  async "facebook.comment_reply"(ctx, p) {
    const out = await graph(ctx, "POST", `${encodeURIComponent(p.comment_id)}/comments`, { message: p.message });
    return { comment_id: out.id || null, in_reply_to: p.comment_id };
  },
  async "instagram.comment_hide"(ctx, p) {
    await graph(ctx, "POST", encodeURIComponent(p.comment_id), { hide: p.hidden });
    return { comment_id: p.comment_id, hidden: p.hidden };
  },
  async "instagram.comment_delete"(ctx, p) {
    await graph(ctx, "DELETE", encodeURIComponent(p.comment_id));
    return { comment_id: p.comment_id, deleted: true };
  },
  async "instagram.comment_reply"(ctx, p) {
    const out = await graph(ctx, "POST", `${encodeURIComponent(p.comment_id)}/replies`, { message: p.message });
    return { comment_id: out.id || null, in_reply_to: p.comment_id };
  },
  async "instagram.set_comments_enabled"(ctx, p) {
    await graph(ctx, "POST", encodeURIComponent(p.media_id), { comment_enabled: p.enabled });
    return { media_id: p.media_id, comments_enabled: p.enabled };
  },
};

// ---------- X ----------

function xClient(ctx) {
  const budget = { used: false };
  let secrets = ctx.secrets;
  async function call(method, url, { json, form } = {}) {
    secrets = await xEnsure({ secrets, oauth: ctx.config.x, fetchImpl: ctx.fetchImpl, onSecrets: ctx.onSecrets });
    const sent = await sendWithRefresh({
      budget,
      secrets,
      refresh: (current) => xRefresh({ secrets: current, oauth: ctx.config.x, fetchImpl: ctx.fetchImpl }),
      onSecrets: ctx.onSecrets,
      onNeedsReconnect: ctx.onNeedsReconnect,
      send: (current) =>
        ctx.fetchImpl(url, {
          method,
          headers: { authorization: `Bearer ${current.access_token}`, ...(json ? { "content-type": "application/json" } : {}) },
          body: json ? JSON.stringify(json) : form,
        }),
    });
    secrets = sent.secrets;
    const payload = await readJson(sent.response);
    if (!sent.response.ok) throw fail("x_manage_failed", payload, `X returned ${sent.response.status}.`);
    return payload;
  }
  return { call };
}

async function uploadXMedia(ctx, x, mediaPath) {
  const file = resolveSafeMediaPath(mediaPath, ctx.mediaRoot);
  const ext = extname(file).toLowerCase();
  const type = IMAGE_TYPES[ext] || VIDEO_TYPES[ext];
  if (!type) throw mcpError("invalid_media", "X media must be PNG, JPEG, WEBP, GIF, MP4 or MOV.", 400);
  const bytes = readFileSync(file);
  const isVideo = type.startsWith("video/");
  const category = isVideo ? "tweet_video" : type === "image/gif" ? "tweet_gif" : "tweet_image";
  const init = await x.call("POST", `${X_MEDIA_API}/initialize`, { json: { media_type: type, total_bytes: bytes.length, media_category: category } });
  const mediaId = init.data?.id;
  if (!mediaId) throw mcpError("x_manage_failed", "X did not start the media upload.", 502);
  const chunk = 4 * 1024 * 1024;
  for (let index = 0, start = 0; start < bytes.length; index += 1, start += chunk) {
    const form = new FormData();
    form.set("segment_index", String(index));
    form.set("media", new Blob([bytes.subarray(start, start + chunk)], { type }), "chunk");
    await x.call("POST", `${X_MEDIA_API}/${mediaId}/append`, { form });
  }
  let state = (await x.call("POST", `${X_MEDIA_API}/${mediaId}/finalize`)).data?.processing_info;
  const sleep = ctx.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let tries = 0; state && ["pending", "in_progress"].includes(state.state) && tries < 60; tries += 1) {
    await sleep(Math.min(10, Number(state.check_after_secs) || 2) * 1000);
    state = (await x.call("GET", `${X_MEDIA_API}?command=STATUS&media_id=${mediaId}`)).data?.processing_info;
  }
  if (state?.state === "failed") throw mcpError("x_manage_failed", "X could not process that media file.", 502);
  return String(mediaId);
}

async function xPost(ctx, p, replyTo) {
  const x = xClient(ctx);
  const mediaIds = [];
  for (const item of p.media_paths || []) mediaIds.push(await uploadXMedia(ctx, x, item));
  const body = { text: p.text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  if (mediaIds.length) body.media = { media_ids: mediaIds };
  const out = await x.call("POST", `${X_API}/tweets`, { json: body });
  const id = out.data?.id;
  if (!id) throw mcpError("x_manage_failed", "X did not return the new post id.", 502);
  return { tweet_id: String(id), url: `https://x.com/i/web/status/${id}`, media_ids: mediaIds };
}

function xUserId(ctx) {
  const id = ctx.connection.user_id;
  if (!id) throw mcpError("not_connected", "The X connection has no user id. Reconnect X.", 409);
  return id;
}

const x = {
  "x.create_post": (ctx, p) => xPost(ctx, p, null),
  "x.reply": (ctx, p) => xPost(ctx, p, p.in_reply_to),
  async "x.delete_post"(ctx, p) {
    const out = await xClient(ctx).call("DELETE", `${X_API}/tweets/${encodeURIComponent(p.tweet_id)}`);
    if (out.data?.deleted !== true) throw mcpError("x_manage_failed", "X did not confirm the delete.", 502);
    return { tweet_id: p.tweet_id, deleted: true };
  },
  async "x.like"(ctx, p) {
    await xClient(ctx).call("POST", `${X_API}/users/${encodeURIComponent(xUserId(ctx))}/likes`, { json: { tweet_id: p.tweet_id } });
    return { tweet_id: p.tweet_id, liked: true };
  },
  async "x.follow"(ctx, p) {
    const client = xClient(ctx);
    let target = p.user_id;
    if (!target) {
      const found = await client.call("GET", `${X_API}/users/by/username/${encodeURIComponent(p.username)}`);
      target = found.data?.id;
      if (!target) throw mcpError("not_found", `X has no account @${p.username}.`, 404);
    }
    const out = await client.call("POST", `${X_API}/users/${encodeURIComponent(xUserId(ctx))}/following`, { json: { target_user_id: String(target) } });
    return { user_id: String(target), following: out.data?.following === true, pending: out.data?.pending_follow === true };
  },
};

export const EXECUTORS = { ...youtube, ...meta, ...x };
