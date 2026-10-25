import { randomBytes } from "node:crypto";
import { findBrand, SOCIAL_BRANDS } from "./brands.js";
import { socialId } from "./ids.js";
import { socialError } from "./errors.js";
import {
  AGENT_STATUSES,
  CONTENT_TYPE_EXTENSION,
  PLATFORMS,
  REVIEWABLE_STATUSES,
  THUMBNAIL_CONTENT_TYPES,
  THUMBNAIL_MAX_BYTES,
  TOKEN_INDEX_LIMIT,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
} from "./constants.js";
import { generateApiToken, hashApiToken, tokenHashesEqual } from "./apiTokens.js";
import { overrideReasonOk, vidiqBlockReason } from "./approval.js";
import {
  appendAudit,
  kvGet,
  kvSet,
  countTokenRecords,
  deleteConnection,
  deleteGrant,
  deleteJob,
  getConnectionEnvelope,
  getGrant,
  getJobEnvelope,
  getPost,
  getTokenRecord,
  listAudit,
  listPosts,
  listTokenRecords,
  saveConnectionEnvelope,
  saveGrant,
  saveJobEnvelope,
  saveNonce,
  savePost,
  saveTokenRecord,
  takeNonce,
} from "./store.js";
import { applyAgentEdits, assertAgentMayEdit, cleanPrivacy, cleanString, cleanTimestamp } from "./validation.js";
import { decryptSocialJson, encryptSocialJson, signSocialState, verifySocialState } from "./tokenCrypto.js";
import {
  assertSocialPath,
  deleteSocialBlob,
  issueClientUploadToken,
  listSocialBlobs,
  readSocialBlobRange,
  statSocialBlob,
} from "./blobAccess.js";
import {
  exchangeGoogleCode,
  fetchYouTubeChannel,
  googleAuthorizationUrl,
  googleOAuthConfig,
} from "./google.js";
import { publisherFor } from "./publishers/index.js";
import { PUBLISH_BUDGET_MS } from "./constants.js";

function requireBrand(brandId) {
  const brand = findBrand(brandId);
  if (!brand) throw socialError(400, "unknown_brand", "Unknown brand.");
  return brand;
}

function publicToken(record) {
  return {
    id: record.id,
    brand_id: record.brand_id,
    label: record.label,
    prefix: record.prefix,
    created_at: record.created_at,
    revoked_at: record.revoked_at || null,
  };
}

function publicPost(post) {
  if (!post) return null;
  const { publish_lock_until, ...rest } = post;
  return rest;
}

function publicConnection(record) {
  return {
    brand_id: record.brand_id,
    platform: record.platform,
    account_label: record.account_label,
    channel_id: record.channel_id,
    connected_at: record.connected_at,
    updated_at: record.updated_at,
  };
}

async function audit(action, { actor, brandId, postId = null, detail = null, now = Date.now() }) {
  await appendAudit({
    id: socialId("aud"),
    at: new Date(now).toISOString(),
    actor,
    brand_id: brandId,
    action,
    post_id: postId,
    detail,
  });
}

export async function authenticateAgentToken(secret) {
  const token = String(secret || "");
  if (!token.startsWith("stp_") || token.length < 20 || token.length > 200) {
    throw socialError(401, "unauthorized", "A brand token is required.");
  }
  const hash = hashApiToken(token);
  const record = await getTokenRecord(hash);
  const matches = tokenHashesEqual(record?.token_hash || hashApiToken("stp_invalid_placeholder_value"), hash);
  if (!record || record.revoked_at || !matches || record.token_hash !== hash) {
    throw socialError(401, "unauthorized", "A brand token is required.");
  }
  const brand = findBrand(record.brand_id);
  if (!brand) throw socialError(401, "unauthorized", "A brand token is required.");
  return record;
}

async function requireAgentPost(token, postId) {
  const post = await getPost(postId);
  if (!post || post.brand_id !== token.brand_id) {
    throw socialError(404, "not_found", "Post not found.");
  }
  return post;
}

export async function createPostForToken(token, input, now = Date.now()) {
  assertAgentMayEdit(input, token.brand_id);
  if (input.confirm_upload) throw socialError(400, "invalid_request", "Create the draft before confirming an upload.");
  const platform = String(input.platform || "");
  if (!PLATFORMS.includes(platform)) throw socialError(400, "invalid_field", "Platform is not supported.");
  const stamp = new Date(now).toISOString();
  const post = applyAgentEdits({
    id: socialId("post"),
    brand_id: token.brand_id,
    platform,
    status: "draft",
    title: "",
    description: "",
    tags: [],
    thumbnail_asset: null,
    video_asset: null,
    caption: "",
    scheduled_at: null,
    privacy_status: "private",
    approved_by: null,
    approved_at: null,
    published_url: null,
    error: null,
    created_by_token_id: token.id,
    title_score: null,
    thumbnail_score: null,
    keywords: [],
    checked_at: null,
    override_reason: null,
    override_by: null,
    publish_lock_until: null,
    created_at: stamp,
    updated_at: stamp,
  }, input);
  if (!AGENT_STATUSES.includes(post.status)) {
    throw socialError(403, "agent_forbidden", "This token cannot approve, schedule, or publish.");
  }
  await savePost(post, { create: true });
  await audit("post_created", { actor: `token:${token.id}`, brandId: token.brand_id, postId: post.id, now });
  return publicPost(post);
}

async function confirmUpload(token, post, confirm, statBlob) {
  const kind = confirm?.kind;
  if (kind !== "video" && kind !== "thumbnail") {
    throw socialError(400, "invalid_asset", "Upload kind must be video or thumbnail.");
  }
  const pathname = String(confirm.pathname || "");
  assertSocialPath(pathname, token.brand_id, post.id);
  const grant = await getGrant(token.brand_id, post.id, kind);
  if (!grant || grant.pathname !== pathname || Date.parse(grant.expires_at) <= Date.now()) {
    throw socialError(400, "invalid_asset", "Request an upload URL for this post before confirming the file.");
  }
  let meta;
  try {
    meta = await statBlob(pathname);
  } catch (error) {
    if (error.statusCode) throw error;
    throw socialError(400, "invalid_asset", "The uploaded file was not found.");
  }
  const allowed = kind === "video" ? VIDEO_CONTENT_TYPES : THUMBNAIL_CONTENT_TYPES;
  const max = kind === "video" ? VIDEO_MAX_BYTES : THUMBNAIL_MAX_BYTES;
  const size = Number(meta.size);
  if (!allowed.includes(meta.contentType) || !Number.isInteger(size) || size <= 0 || size > max) {
    throw socialError(400, "invalid_asset", "The uploaded file type or size is not allowed.");
  }
  if (meta.pathname && meta.pathname !== pathname) {
    throw socialError(400, "invalid_asset", "The uploaded file path does not match this post.");
  }
  await deleteGrant(token.brand_id, post.id, kind);
  return {
    kind,
    asset: {
      pathname,
      url: meta.url || null,
      content_type: meta.contentType,
      size,
    },
  };
}

export async function updatePostForToken(token, postId, input, deps = {}) {
  const now = deps.now || Date.now();
  assertAgentMayEdit(input, token.brand_id);
  const post = await requireAgentPost(token, postId);
  if (!AGENT_STATUSES.includes(post.status)) {
    throw socialError(409, "not_editable", "Only drafts can be updated with a brand token.");
  }
  const next = applyAgentEdits(post, input);
  if (input.confirm_upload) {
    const attached = await confirmUpload(token, next, input.confirm_upload, deps.statBlob || statSocialBlob);
    if (attached.kind === "video") next.video_asset = attached.asset;
    else next.thumbnail_asset = attached.asset;
  }
  next.updated_at = new Date(now).toISOString();
  await savePost(next);
  await audit("post_updated", {
    actor: `token:${token.id}`,
    brandId: token.brand_id,
    postId: next.id,
    detail: input.confirm_upload ? { confirmed: input.confirm_upload.kind } : null,
    now,
  });
  return publicPost(next);
}

export async function listPostsForToken(token) {
  const posts = await listPosts(token.brand_id);
  return posts
    .filter((post) => AGENT_STATUSES.includes(post.status))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, 100)
    .map(publicPost);
}

export async function issueUploadForToken(token, input, deps = {}) {
  const post = await requireAgentPost(token, input.post_id);
  if (!AGENT_STATUSES.includes(post.status)) {
    throw socialError(409, "not_editable", "Only drafts can accept uploads.");
  }
  const kind = input.kind;
  if (kind !== "video" && kind !== "thumbnail") {
    throw socialError(400, "invalid_asset", "Upload kind must be video or thumbnail.");
  }
  const contentType = String(input.content_type || "");
  const allowed = kind === "video" ? VIDEO_CONTENT_TYPES : THUMBNAIL_CONTENT_TYPES;
  const max = kind === "video" ? VIDEO_MAX_BYTES : THUMBNAIL_MAX_BYTES;
  if (!allowed.includes(contentType)) throw socialError(400, "invalid_asset", "File type is not allowed.");
  const size = Number(input.size);
  if (!Number.isInteger(size) || size <= 0 || size > max) {
    throw socialError(400, "invalid_asset", "File size is not allowed.");
  }
  const pathname = `social/${token.brand_id}/${post.id}/${kind}-${randomBytes(8).toString("hex")}.${CONTENT_TYPE_EXTENSION[contentType]}`;
  const expires = Date.now() + 60 * 60 * 1000;
  const issuer = deps.issueToken || issueClientUploadToken;
  const clientToken = await issuer({
    pathname,
    contentType,
    maximumSizeInBytes: max,
    validUntil: expires,
  });
  if (typeof clientToken !== "string" || clientToken.length < 10) {
    throw socialError(502, "blob_unavailable", "Upload URL could not be issued.");
  }
  await saveGrant({
    brand_id: token.brand_id,
    post_id: post.id,
    kind,
    pathname,
    content_type: contentType,
    size,
    expires_at: new Date(expires).toISOString(),
  });
  await audit("upload_granted", {
    actor: `token:${token.id}`,
    brandId: token.brand_id,
    postId: post.id,
    detail: { kind },
  });
  return {
    pathname,
    client_token: clientToken,
    access: "private",
    upload_url: `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`,
    method: "PUT",
    headers: {
      authorization: `Bearer ${clientToken}`,
      "x-api-version": "12",
      "x-vercel-blob-access": "private",
      "x-content-type": contentType,
      "x-content-length": String(size),
    },
    multipart_recommended: size > 100 * 1024 * 1024,
  };
}

export async function loadDesk(brandId) {
  const brand = brandId ? requireBrand(brandId) : SOCIAL_BRANDS[0];
  const posts = (await listPosts(brand.id)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const connections = [];
  for (const platform of PLATFORMS) {
    const envelope = await getConnectionEnvelope(brand.id, platform);
    if (!envelope) continue;
    connections.push(publicConnection(decryptSocialJson(envelope, "social-connection")));
  }
  const tokens = (await listTokenRecords())
    .filter((record) => record.brand_id === brand.id)
    .map(publicToken);
  const auditEvents = (await listAudit()).filter((event) => event.brand_id === brand.id).slice(0, 30);
  return {
    brands: SOCIAL_BRANDS,
    brand_id: brand.id,
    connections,
    posts: posts.map(publicPost),
    tokens,
    audit: auditEvents,
  };
}

export async function createApiToken(brandId, label, now = Date.now()) {
  const brand = requireBrand(brandId);
  const cleanLabel = cleanString(label, 60, "Label").trim();
  if (cleanLabel.length < 2) throw socialError(400, "invalid_field", "Name the token so you can recognize it later.");
  if (await countTokenRecords() >= TOKEN_INDEX_LIMIT) {
    throw socialError(409, "token_limit", "Revoke an unused token before creating another.");
  }
  const generated = generateApiToken();
  const record = {
    id: socialId("tok"),
    brand_id: brand.id,
    label: cleanLabel,
    prefix: generated.prefix,
    token_hash: generated.token_hash,
    created_at: new Date(now).toISOString(),
    revoked_at: null,
    created_by: "owner",
  };
  await saveTokenRecord(record);
  await audit("token_created", { actor: "owner", brandId: brand.id, detail: { token_id: record.id, label: cleanLabel }, now });
  return { secret: generated.secret, token: publicToken(record) };
}

export async function revokeApiToken(tokenId, now = Date.now()) {
  const records = await listTokenRecords();
  const record = records.find((item) => item.id === tokenId);
  if (!record) throw socialError(404, "not_found", "Token not found.");
  record.revoked_at = new Date(now).toISOString();
  await saveTokenRecord(record);
  await audit("token_revoked", { actor: "owner", brandId: record.brand_id, detail: { token_id: record.id }, now });
  return publicToken(record);
}

async function requireOwnerPost(postId) {
  const post = await getPost(postId);
  if (!post || !findBrand(post.brand_id)) throw socialError(404, "not_found", "Post not found.");
  return post;
}

export async function approvePost(postId, overrideReason, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (!REVIEWABLE_STATUSES.includes(post.status)) {
    throw socialError(409, "not_reviewable", "This post is not waiting for review.");
  }
  if (!String(post.title || "").trim()) throw socialError(400, "invalid_field", "A title is required.");
  const block = vidiqBlockReason(post);
  const override = Boolean(block);
  if (override && !overrideReasonOk(overrideReason)) {
    throw socialError(409, "vidiq_gate", block);
  }
  const stamp = new Date(now).toISOString();
  post.status = "approved";
  post.approved_by = "owner";
  post.approved_at = stamp;
  post.updated_at = stamp;
  post.error = null;
  if (override) {
    post.override_reason = String(overrideReason).trim();
    post.override_by = "owner";
  } else {
    post.override_reason = null;
    post.override_by = null;
  }
  await savePost(post);
  await audit(override ? "approve_override" : "approved", {
    actor: "owner",
    brandId: post.brand_id,
    postId: post.id,
    detail: override
      ? {
        reason: post.override_reason,
        title_score: post.title_score,
        thumbnail_score: post.thumbnail_score,
        keywords: post.keywords,
      }
      : { title_score: post.title_score, thumbnail_score: post.thumbnail_score },
    now,
  });
  return publicPost(post);
}

const DRAFT_PLATFORMS = new Set(["youtube"]);
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_SECONDS = 60 * 60;

/** Delete any temporary blobs still attached to a post. Best effort. */
async function dropTempAssets(post, deleteAsset = deleteSocialBlob, now = Date.now()) {
  const stamp = new Date(now).toISOString();
  for (const key of ["video_asset", "thumbnail_asset"]) {
    const asset = post[key];
    if (!asset?.pathname) continue;
    try {
      await deleteAsset(asset.pathname);
      post[key] = { ...asset, pathname: null, url: null, deleted_at: stamp };
    } catch {
      // Left for the orphan sweeper.
    }
  }
}

export async function rejectPost(postId, reason, now = Date.now(), deps = {}) {
  const post = await requireOwnerPost(postId);
  if (post.status === "publishing" || post.status === "published") {
    throw socialError(409, "not_rejectable", "A post that is publishing or already live cannot be rejected.");
  }
  const stamp = new Date(now).toISOString();
  post.status = "rejected";
  post.error = cleanString(reason || "Rejected by owner.", 500, "Reason").trim() || "Rejected by owner.";
  post.publish_lock_until = null;
  // Rejection is the cancel path: no temp media survives it. A YouTube draft
  // already uploaded stays PRIVATE on the channel for the owner to delete there.
  await dropTempAssets(post, deps.deleteAsset || deleteSocialBlob, now);
  post.updated_at = stamp;
  await savePost(post);
  await audit("rejected", { actor: "owner", brandId: post.brand_id, postId: post.id, detail: { reason: post.error }, now });
  return publicPost(post);
}

export async function schedulePost(postId, scheduledAt, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (post.status !== "approved" && post.status !== "scheduled") {
    throw socialError(409, "not_approved", "Approve the post before scheduling it.");
  }
  const when = cleanTimestamp(scheduledAt, "Schedule");
  if (!when) throw socialError(400, "invalid_field", "Choose a schedule time.");
  if (Date.parse(when) > now + 366 * 24 * 60 * 60 * 1000) {
    throw socialError(400, "invalid_field", "Schedule time is too far out.");
  }
  post.status = "scheduled";
  post.scheduled_at = when;
  post.updated_at = new Date(now).toISOString();
  post.error = null;
  await savePost(post);
  await audit("scheduled", { actor: "owner", brandId: post.brand_id, postId: post.id, detail: { scheduled_at: when }, now });
  return publicPost(post);
}

export async function setPostPrivacy(postId, privacy, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (post.status === "publishing" || post.status === "published") {
    throw socialError(409, "not_editable", "Privacy can no longer be changed on this post.");
  }
  post.privacy_status = cleanPrivacy(privacy);
  post.updated_at = new Date(now).toISOString();
  await savePost(post);
  await audit("privacy_updated", {
    actor: "owner",
    brandId: post.brand_id,
    postId: post.id,
    detail: { privacy_status: post.privacy_status },
    now,
  });
  return publicPost(post);
}

export async function retryPost(postId, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (post.status !== "failed") throw socialError(409, "not_retryable", "Only a failed post can be retried.");
  const stamp = new Date(now).toISOString();
  post.status = "scheduled";
  post.scheduled_at = stamp;
  post.error = null;
  post.publish_lock_until = null;
  post.updated_at = stamp;
  await savePost(post);
  await audit("retry", { actor: "owner", brandId: post.brand_id, postId: post.id, now });
  return publicPost(post);
}

export async function restartUpload(postId, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (post.status !== "failed" && post.status !== "publishing") {
    throw socialError(409, "not_retryable", "Only a failed or in-progress upload can be restarted.");
  }
  // Once the video is a YouTube draft the temp file is gone; keep the job so
  // publishing resumes from the platform draft instead of re-uploading.
  if (!hasPlatformDraft(post)) {
    await deleteJob(post.id);
    post.platform_draft = null;
  }
  const stamp = new Date(now).toISOString();
  post.status = "scheduled";
  post.scheduled_at = stamp;
  post.error = null;
  post.publish_lock_until = null;
  post.updated_at = stamp;
  await savePost(post);
  await audit("upload_restarted", { actor: "owner", brandId: post.brand_id, postId: post.id, now });
  return publicPost(post);
}

export async function beginYouTubeConnect(brandId, now = Date.now()) {
  const brand = requireBrand(brandId);
  const oauth = googleOAuthConfig();
  const nonce = randomBytes(16).toString("hex");
  const state = signSocialState({
    v: 1,
    brand_id: brand.id,
    platform: "youtube",
    nonce,
    exp: now + 10 * 60 * 1000,
  });
  await saveNonce(nonce, brand.id);
  await audit("oauth_started", { actor: "owner", brandId: brand.id, detail: { platform: "youtube" }, now });
  return {
    authorization_url: googleAuthorizationUrl({
      state,
      redirectUri: oauth.redirectUri,
      clientId: oauth.clientId,
    }),
  };
}

export async function completeYouTubeOAuth({ code, state, fetchImpl = fetch, now = Date.now() }) {
  const payload = verifySocialState(state);
  if (payload?.v !== 1 || payload.platform !== "youtube" || !payload.nonce || !payload.brand_id) {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now) {
    throw socialError(400, "invalid_state", "The connection attempt expired. Try again.");
  }
  const brand = requireBrand(payload.brand_id);
  const stored = await takeNonce(payload.nonce);
  if (stored !== brand.id) throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  if (!code || String(code).length > 2048) throw socialError(400, "oauth_failed", "Google did not return an authorization code.");
  const oauth = googleOAuthConfig();
  const tokens = await exchangeGoogleCode({
    code: String(code),
    redirectUri: oauth.redirectUri,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    fetchImpl,
  });
  const channel = await fetchYouTubeChannel({ accessToken: tokens.access_token, fetchImpl });
  const record = {
    brand_id: brand.id,
    platform: "youtube",
    account_label: channel.account_label,
    channel_id: channel.channel_id,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: tokens.expires_at,
    scope: tokens.scope,
    connected_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  await saveConnectionEnvelope(brand.id, "youtube", encryptSocialJson(record, "social-connection"));
  await audit("oauth_connected", {
    actor: "owner",
    brandId: brand.id,
    detail: { platform: "youtube", account_label: channel.account_label, channel_id: channel.channel_id },
    now,
  });
  return brand.id;
}

export async function disconnectPlatform(brandId, platform, now = Date.now()) {
  const brand = requireBrand(brandId);
  if (!PLATFORMS.includes(platform)) throw socialError(400, "unsupported_platform", "Platform is not supported.");
  await deleteConnection(brand.id, platform);
  await audit("oauth_disconnected", { actor: "owner", brandId: brand.id, detail: { platform }, now });
}

async function listDuePosts(now) {
  const due = [];
  for (const brand of SOCIAL_BRANDS) {
    const posts = await listPosts(brand.id);
    for (const post of posts) {
      if (post.status === "publishing") due.push(post);
      else if (post.status === "scheduled" && post.scheduled_at && Date.parse(post.scheduled_at) <= now) due.push(post);
    }
  }
  due.sort((a, b) => {
    if (a.status === "publishing" && b.status !== "publishing") return -1;
    if (b.status === "publishing" && a.status !== "publishing") return 1;
    return String(a.scheduled_at || a.updated_at).localeCompare(String(b.scheduled_at || b.updated_at));
  });
  return due;
}

const DRAFTABLE_STATUSES = ["draft", "ready_for_review", "approved", "scheduled"];

async function listDraftCandidates() {
  const out = [];
  for (const brand of SOCIAL_BRANDS) {
    const posts = await listPosts(brand.id);
    for (const post of posts) {
      if (!DRAFT_PLATFORMS.has(post.platform)) continue;
      if (!DRAFTABLE_STATUSES.includes(post.status)) continue;
      if (post.platform_draft?.status === "ready" || post.platform_draft?.status === "failed") continue;
      if (!post.video_asset?.pathname || !post.thumbnail_asset?.pathname) continue;
      out.push(post);
    }
  }
  return out;
}

function hasPlatformDraft(post) {
  return post.platform_draft?.status === "ready" && Boolean(post.platform_draft.video_id);
}

function preflight(post) {
  if (!String(post.title || "").trim()) return "A title is required.";
  if ((post.tags || []).join(",").length > 500) return "Tags are too long for YouTube.";
  if (hasPlatformDraft(post)) return "";
  if (!post.video_asset?.pathname || !post.video_asset.size) return "Video file is missing.";
  if (post.platform === "youtube" && (!post.thumbnail_asset?.pathname || !post.thumbnail_asset.size)) {
    return "Thumbnail is missing.";
  }
  return "";
}

export async function publishDueSlice(deps = {}) {
  const now = deps.now || Date.now();
  const actor = deps.actor || "owner";
  const due = await listDuePosts(now);
  if (!due.length) return draftSlice(deps, now, actor);
  const ready = [];
  for (const candidate of due) {
    if (candidate.publish_lock_until && Date.parse(candidate.publish_lock_until) > now) continue;
    if (preflight(candidate)) continue;
    ready.push(candidate);
  }
  const post = ready[0];
  if (!post) {
    const locked = due.find((candidate) => candidate.publish_lock_until && Date.parse(candidate.publish_lock_until) > now);
    if (locked) {
      return {
        continued: true,
        locked: true,
        retry_after_ms: 2000,
        post_id: locked.id,
        status: locked.status,
        bytes_uploaded: 0,
        total_bytes: locked.video_asset?.size || 0,
      };
    }
    const waiting = due[0];
    return { continued: false, post_id: waiting?.id, status: waiting?.status, message: preflight(waiting) || "No posts are due." };
  }

  const publisher = publisherFor(post.platform);
  if (!publisher.implemented) {
    post.status = "failed";
    post.error = `${publisher.label} publishing is not implemented.`;
    post.updated_at = new Date(now).toISOString();
    await savePost(post);
    await audit("publish_failed", { actor, brandId: post.brand_id, postId: post.id, detail: { message: post.error }, now });
    const more = (await listDuePosts(now)).some((item) => item.id !== post.id);
    return { continued: more, post_id: post.id, status: "failed", message: post.error };
  }

  post.status = "publishing";
  post.publish_lock_until = new Date(now + 20_000).toISOString();
  post.error = null;
  post.updated_at = new Date(now).toISOString();
  await savePost(post);

  try {
    const envelope = await getConnectionEnvelope(post.brand_id, post.platform);
    if (!envelope) throw socialError(409, "youtube_not_connected", "YouTube is not connected for this brand.");
    const secrets = decryptSocialJson(envelope, "social-connection");
    const jobEnvelope = await getJobEnvelope(post.id);
    const job = jobEnvelope ? decryptSocialJson(jobEnvelope, "social-upload-session") : null;
    const oauth = googleOAuthConfig();
    const result = await publisher.publishSlice({
      post,
      secrets,
      job,
      readRange: deps.readRange || readSocialBlobRange,
      fetchImpl: deps.fetchImpl || fetch,
      oauth: { clientId: oauth.clientId, clientSecret: oauth.clientSecret },
      now,
      deadline: now + (deps.budgetMs || PUBLISH_BUDGET_MS),
      stage: "publish",
      deleteAsset: deps.deleteAsset || deleteSocialBlob,
    });
    await saveConnectionEnvelope(post.brand_id, post.platform, encryptSocialJson({
      ...secrets,
      access_token: result.secrets?.access_token || secrets.access_token,
      expires_at: result.secrets?.expires_at || secrets.expires_at,
      refresh_token: secrets.refresh_token,
      updated_at: new Date(now).toISOString(),
    }, "social-connection"));
    if (result.job) await saveJobEnvelope(post.id, encryptSocialJson(result.job, "social-upload-session"));
    if (result.drafted && result.job?.video_id) {
      post.platform_draft = { status: "ready", video_id: result.job.video_id, updated_at: new Date(now).toISOString() };
      markAssetsGone(post, now);
    }
    if (result.done) {
      post.status = "published";
      post.published_url = result.publishedUrl;
      post.error = null;
      // Instagram/X have no draft API: their temp blob goes the moment the post is live.
      await dropTempAssets(post, deps.deleteAsset || deleteSocialBlob, now);
    } else {
      post.status = "publishing";
    }
    post.publish_lock_until = null;
    post.updated_at = new Date().toISOString();
    await savePost(post);
    await audit(result.done ? "published" : "publish_progress", {
      actor,
      brandId: post.brand_id,
      postId: post.id,
      detail: {
        bytes_uploaded: result.job?.next_byte || 0,
        total_bytes: result.job?.total_bytes || post.video_asset.size,
      },
      now,
    });
    const more = result.done ? (await listDuePosts(Date.now())).length > 0 : true;
    return {
      continued: more,
      post_id: post.id,
      status: post.status,
      bytes_uploaded: result.job?.next_byte || 0,
      total_bytes: result.job?.total_bytes || post.video_asset.size,
      published_url: result.done ? result.publishedUrl : null,
    };
  } catch (error) {
    post.status = "failed";
    post.error = String(error.message || "Publish failed.").slice(0, 300);
    post.publish_lock_until = null;
    post.updated_at = new Date().toISOString();
    await savePost(post);
    await audit("publish_failed", { actor, brandId: post.brand_id, postId: post.id, detail: { message: post.error }, now });
    return { continued: false, post_id: post.id, status: "failed", message: post.error };
  }
}

function markAssetsGone(post, now) {
  const stamp = new Date(now).toISOString();
  for (const key of ["video_asset", "thumbnail_asset"]) {
    if (post[key]?.pathname) post[key] = { ...post[key], pathname: null, url: null, deleted_at: stamp };
  }
}

/**
 * Upload one confirmed YouTube video toward its PRIVATE platform draft.
 * Runs on the existing cron call when nothing is due to publish. Status is
 * untouched: approval is still required before anything becomes visible.
 */
async function draftSlice(deps, now, actor) {
  const candidates = (await listDraftCandidates())
    .filter((post) => !(post.draft_lock_until && Date.parse(post.draft_lock_until) > now));
  const post = candidates[0];
  if (!post) return { continued: false, message: "No posts are due." };
  post.draft_lock_until = new Date(now + 20_000).toISOString();
  post.platform_draft = { ...(post.platform_draft || {}), status: "uploading" };
  await savePost(post);
  try {
    const envelope = await getConnectionEnvelope(post.brand_id, post.platform);
    if (!envelope) throw socialError(409, "youtube_not_connected", "YouTube is not connected for this brand.");
    const secrets = decryptSocialJson(envelope, "social-connection");
    const jobEnvelope = await getJobEnvelope(post.id);
    const job = jobEnvelope ? decryptSocialJson(jobEnvelope, "social-upload-session") : null;
    const oauth = googleOAuthConfig();
    const result = await publisherFor(post.platform).publishSlice({
      post,
      secrets,
      job,
      readRange: deps.readRange || readSocialBlobRange,
      fetchImpl: deps.fetchImpl || fetch,
      oauth: { clientId: oauth.clientId, clientSecret: oauth.clientSecret },
      now,
      deadline: now + (deps.budgetMs || PUBLISH_BUDGET_MS),
      stage: "draft",
      deleteAsset: deps.deleteAsset || deleteSocialBlob,
    });
    await saveConnectionEnvelope(post.brand_id, post.platform, encryptSocialJson({
      ...secrets,
      access_token: result.secrets?.access_token || secrets.access_token,
      expires_at: result.secrets?.expires_at || secrets.expires_at,
      refresh_token: secrets.refresh_token,
      updated_at: new Date(now).toISOString(),
    }, "social-connection"));
    if (result.job) await saveJobEnvelope(post.id, encryptSocialJson(result.job, "social-upload-session"));
    if (result.drafted && result.job?.video_id) {
      post.platform_draft = { status: "ready", video_id: result.job.video_id, updated_at: new Date(now).toISOString() };
      markAssetsGone(post, now);
    } else {
      post.platform_draft = { status: "uploading", bytes_uploaded: result.job?.next_byte || 0, total_bytes: result.job?.total_bytes || 0 };
    }
    post.draft_lock_until = null;
    await savePost(post);
    await audit(post.platform_draft.status === "ready" ? "platform_draft_ready" : "platform_draft_progress", {
      actor, brandId: post.brand_id, postId: post.id,
      detail: { bytes_uploaded: result.job?.next_byte || 0, total_bytes: result.job?.total_bytes || 0 },
      now,
    });
    return {
      continued: true,
      post_id: post.id,
      status: post.status,
      draft_status: post.platform_draft.status,
      bytes_uploaded: result.job?.next_byte || 0,
      total_bytes: result.job?.total_bytes || 0,
    };
  } catch (error) {
    post.platform_draft = { status: "failed", error: String(error.message || "Draft upload failed.").slice(0, 300) };
    post.draft_lock_until = null;
    await savePost(post);
    await audit("platform_draft_failed", { actor, brandId: post.brand_id, postId: post.id, detail: { message: post.platform_draft.error }, now });
    return { continued: false, post_id: post.id, status: post.status, draft_status: "failed", message: post.platform_draft.error };
  }
}

const TERMINAL_STATUSES = new Set(["published", "rejected"]);

/**
 * Delete social/ blobs older than 24h that no live post still needs.
 * Hooked onto the existing externally-triggered /api/social/cron call and
 * throttled to once an hour; no new scheduled job is added.
 */
export async function sweepOrphanBlobs(deps = {}) {
  const now = deps.now || Date.now();
  const getMark = deps.kvGet || kvGet;
  const setMark = deps.kvSet || kvSet;
  if (!deps.force) {
    const last = await getMark("social:sweep:last");
    if (last && now - Number(last) < SWEEP_INTERVAL_SECONDS * 1000) return { swept: 0, skipped: true };
  }
  await setMark("social:sweep:last", String(now), SWEEP_INTERVAL_SECONDS * 2);
  const needed = new Set();
  for (const brand of SOCIAL_BRANDS) {
    for (const post of await listPosts(brand.id)) {
      if (TERMINAL_STATUSES.has(post.status)) continue;
      for (const key of ["video_asset", "thumbnail_asset"]) if (post[key]?.pathname) needed.add(post[key].pathname);
    }
  }
  const listPage = deps.listBlobs || listSocialBlobs;
  const remove = deps.deleteAsset || deleteSocialBlob;
  let cursor;
  let swept = 0;
  for (let page = 0; page < 5; page += 1) {
    const result = await listPage({ cursor, limit: 100 });
    for (const blob of result.blobs) {
      const age = now - new Date(blob.uploadedAt).getTime();
      if (age < ORPHAN_AGE_MS || needed.has(blob.pathname)) continue;
      try {
        await remove(blob.pathname);
        swept += 1;
      } catch {
        // try again next sweep
      }
    }
    cursor = result.cursor;
    if (!cursor) break;
  }
  return { swept, skipped: false };
}
