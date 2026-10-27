import { randomBytes } from "node:crypto";
import { expectedAccount, findBrand, SOCIAL_BRANDS } from "./brands.js";
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
import { applyAgentEdits, assertAgentMayEdit, cleanPrivacy, cleanScore, cleanString, cleanStringArray, cleanTimestamp } from "./validation.js";
import { decryptSocialJson, encryptSocialJson, signSocialState, verifySocialState } from "./tokenCrypto.js";
import {
  assertSocialPath,
  copySocialBlob,
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
import { exchangeMetaCode, fetchMetaPages, metaAuthorizationUrl, metaOAuthConfig } from "./meta.js";
import {
  exchangeTikTokCode,
  fetchTikTokUser,
  tiktokAuthorizationUrl,
  tiktokOAuthConfig,
} from "./tiktokAuth.js";
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
    channel_id: record.channel_id || record.instagram_id || record.page_id || record.open_id || "",
    page_id: record.page_id || null,
    instagram_id: record.instagram_id || null,
    open_id: record.open_id || null,
    connected_at: record.connected_at,
    updated_at: record.updated_at,
  };
}

function assertOwnedAccount(brand, platform, actualId) {
  const expected = expectedAccount(brand, platform);
  if (!expected?.id) return;
  if (String(actualId || "") !== String(expected.id)) {
    throw socialError(409, "account_mismatch", `That ${platform} account is not ${expected.label}.`);
  }
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
    proposed_scheduled_at: null,
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

async function issueUploadForPost(post, actor, input, deps = {}) {
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
  const pathname = `social/${post.brand_id}/${post.id}/${kind}-${randomBytes(8).toString("hex")}.${CONTENT_TYPE_EXTENSION[contentType]}`;
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
    brand_id: post.brand_id,
    post_id: post.id,
    kind,
    pathname,
    content_type: contentType,
    size,
    expires_at: new Date(expires).toISOString(),
  });
  await audit("upload_granted", {
    actor,
    brandId: post.brand_id,
    postId: post.id,
    detail: { kind },
  });
  return {
    post_id: post.id,
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

export async function issueUploadForToken(token, input, deps = {}) {
  const post = await requireAgentPost(token, input.post_id);
  if (!AGENT_STATUSES.includes(post.status)) {
    throw socialError(409, "not_editable", "Only drafts can accept uploads.");
  }
  return issueUploadForPost(post, `token:${token.id}`, input, deps);
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
  const missing = await missingConnectSteps(brand.id);
  return {
    brands: SOCIAL_BRANDS,
    brand_id: brand.id,
    connections,
    connect_missing: missing,
    connect_ready: missing.length === 0,
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

const OWNER_QUEUE_PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"];
const OWNER_EDITABLE = ["draft", "ready_for_review", "rejected"];

function cleanOwnerCopy(platform, raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const title = cleanString(source.title || "", 100, "Title").trim();
  const description = cleanString(source.description || "", 5000, "Description");
  const caption = cleanString(source.caption || "", 2200, "Caption");
  const tags = cleanStringArray(source.tags || [], { maxItems: 30, maxItem: 100, label: "Tags" });
  const resolved = title || caption.split("\n")[0].trim().slice(0, 100);
  if (!resolved) throw socialError(400, "invalid_field", `${platform} needs a title or caption.`);
  return { title: resolved, description, caption, tags };
}

export async function queueOwnerShort({ brandId, platforms, copies, privacy, now = Date.now() }) {
  const brand = requireBrand(brandId);
  const selected = [...new Set((Array.isArray(platforms) ? platforms : []).map((item) => String(item)))];
  if (!selected.length || selected.some((platform) => !OWNER_QUEUE_PLATFORMS.includes(platform))) {
    throw socialError(400, "invalid_field", "Choose YouTube, Instagram, Facebook, or TikTok.");
  }
  const privacyStatus = cleanPrivacy(privacy || "private");
  const bundleId = socialId("bundle");
  const stamp = new Date(now).toISOString();
  const posts = [];
  for (const platform of selected) {
    const copy = cleanOwnerCopy(platform, copies?.[platform]);
    const post = {
      id: socialId("post"),
      brand_id: brand.id,
      platform,
      bundle_id: bundleId,
      format: "short",
      status: "ready_for_review",
      title: copy.title,
      description: copy.description,
      tags: copy.tags,
      caption: copy.caption,
      thumbnail_asset: null,
      video_asset: null,
      scheduled_at: null,
      proposed_scheduled_at: null,
      privacy_status: privacyStatus,
      approved_by: null,
      approved_at: null,
      published_url: null,
      platform_ref: null,
      error: null,
      created_by_token_id: null,
      created_by: "owner",
      title_score: null,
      thumbnail_score: null,
      keywords: [],
      checked_at: null,
      override_reason: null,
      override_by: null,
      publish_lock_until: null,
      platform_draft: null,
      created_at: stamp,
      updated_at: stamp,
    };
    await savePost(post, { create: true });
    await audit("post_created", { actor: "owner", brandId: brand.id, postId: post.id, detail: { bundle_id: bundleId }, now });
    posts.push(publicPost(post));
  }
  return { bundle_id: bundleId, posts };
}

export async function issueOwnerUpload(postId, input, deps = {}) {
  const post = await requireOwnerPost(postId);
  if (!OWNER_EDITABLE.includes(post.status)) {
    throw socialError(409, "not_editable", "This post can no longer accept a file.");
  }
  return issueUploadForPost(post, "owner", input, deps);
}

async function shareBundleVideo(post, asset, deps = {}) {
  if (!post.bundle_id || !asset?.pathname) return [];
  const copyBlob = deps.copyBlob || copySocialBlob;
  const siblings = (await listPosts(post.brand_id)).filter((item) => item.bundle_id === post.bundle_id && item.id !== post.id);
  const shared = [];
  for (const sibling of siblings) {
    if (sibling.video_asset?.pathname) continue;
    const extension = CONTENT_TYPE_EXTENSION[asset.content_type] || "mp4";
    const pathname = `social/${post.brand_id}/${sibling.id}/video-${randomBytes(6).toString("hex")}.${extension}`;
    const copied = await copyBlob({ fromPathname: asset.pathname, pathname });
    sibling.video_asset = {
      pathname: copied?.pathname || pathname,
      url: copied?.url || null,
      content_type: asset.content_type,
      size: asset.size,
    };
    sibling.updated_at = new Date().toISOString();
    await savePost(sibling);
    shared.push(sibling.id);
  }
  return shared;
}

export async function confirmOwnerUpload(postId, confirm, deps = {}) {
  const now = deps.now || Date.now();
  const post = await requireOwnerPost(postId);
  if (!OWNER_EDITABLE.includes(post.status)) {
    throw socialError(409, "not_editable", "This post can no longer accept a file.");
  }
  const attached = await confirmUpload({ brand_id: post.brand_id }, post, confirm, deps.statBlob || statSocialBlob);
  if (attached.kind === "video") post.video_asset = attached.asset;
  else post.thumbnail_asset = attached.asset;
  post.updated_at = new Date(now).toISOString();
  await savePost(post);
  const shared = attached.kind === "video" ? await shareBundleVideo(post, attached.asset, deps) : [];
  await audit("post_updated", {
    actor: "owner",
    brandId: post.brand_id,
    postId: post.id,
    detail: { confirmed: attached.kind, shared },
    now,
  });
  return publicPost(post);
}

export async function updateOwnerCopy(postId, input, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (!OWNER_EDITABLE.includes(post.status) && post.status !== "approved" && post.status !== "scheduled" && post.status !== "handed_off") {
    throw socialError(409, "not_editable", "This post can no longer be edited.");
  }
  if (post.status === "publishing" || post.status === "published") {
    throw socialError(409, "not_editable", "This post can no longer be edited.");
  }
  const copy = cleanOwnerCopy(post.platform, input || {});
  post.title = copy.title;
  post.description = copy.description;
  post.caption = copy.caption;
  post.tags = copy.tags;
  if (input?.format === "short" || input?.format === "standard") post.format = input.format;
  post.updated_at = new Date(now).toISOString();
  await savePost(post);
  await audit("copy_updated", { actor: "owner", brandId: post.brand_id, postId: post.id, now });
  return publicPost(post);
}

export async function recordOwnerScores(postId, input, now = Date.now()) {
  const post = await requireOwnerPost(postId);
  if (post.platform !== "youtube") throw socialError(400, "invalid_field", "Scores apply to YouTube.");
  if (!REVIEWABLE_STATUSES.includes(post.status)) {
    throw socialError(409, "not_reviewable", "This post is not waiting for review.");
  }
  post.title_score = cleanScore(input?.title_score, "Title score");
  post.thumbnail_score = cleanScore(input?.thumbnail_score, "Thumbnail score");
  post.keywords = cleanStringArray(input?.keywords || [], { maxItems: 20, maxItem: 80, label: "Keywords" });
  post.checked_at = new Date(now).toISOString();
  post.updated_at = post.checked_at;
  await savePost(post);
  await audit("scores_recorded", {
    actor: "owner",
    brandId: post.brand_id,
    postId: post.id,
    detail: { title_score: post.title_score, thumbnail_score: post.thumbnail_score, keywords: post.keywords },
    now,
  });
  return publicPost(post);
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
  if (post.status !== "failed" && post.status !== "handed_off") {
    throw socialError(409, "not_retryable", "Only a failed or handed-off post can be retried.");
  }
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

const CONNECT_STEPS = ["youtube", "meta", "tiktok"];

function cleanConnectChain(chain) {
  if (!Array.isArray(chain)) return [];
  const seen = new Set();
  const out = [];
  for (const step of chain) {
    const name = String(step || "");
    if (!CONNECT_STEPS.includes(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

async function connectionPresent(brandId, platform) {
  return Boolean(await getConnectionEnvelope(brandId, platform));
}

/** Steps still needed for this brand. Meta covers Facebook + Instagram. */
export async function missingConnectSteps(brandId) {
  const brand = requireBrand(brandId);
  const missing = [];
  if (!(await connectionPresent(brand.id, "youtube"))) missing.push("youtube");
  const hasFacebook = await connectionPresent(brand.id, "facebook");
  const hasInstagram = await connectionPresent(brand.id, "instagram");
  const wantsInstagram = Boolean(expectedAccount(brand, "instagram"));
  if (!hasFacebook || (wantsInstagram && !hasInstagram)) missing.push("meta");
  if (!(await connectionPresent(brand.id, "tiktok"))) missing.push("tiktok");
  return missing;
}

async function beginConnectStep(step, brandId, { chain = [], now = Date.now() } = {}) {
  const brand = requireBrand(brandId);
  const rest = cleanConnectChain(chain).filter((item) => item !== step);
  const nonce = randomBytes(16).toString("hex");
  const state = signSocialState({
    v: 1,
    brand_id: brand.id,
    platform: step,
    nonce,
    chain: rest,
    exp: now + 10 * 60 * 1000,
  });
  await saveNonce(nonce, brand.id);
  await audit("oauth_started", { actor: "owner", brandId: brand.id, detail: { platform: step, chain: rest }, now });
  if (step === "youtube") {
    const oauth = googleOAuthConfig();
    return {
      next: "youtube",
      brand_id: brand.id,
      chain: rest,
      authorization_url: googleAuthorizationUrl({
        state,
        redirectUri: oauth.redirectUri,
        clientId: oauth.clientId,
      }),
    };
  }
  if (step === "meta") {
    const oauth = metaOAuthConfig();
    return {
      next: "meta",
      brand_id: brand.id,
      chain: rest,
      authorization_url: metaAuthorizationUrl({
        state,
        redirectUri: oauth.redirectUri,
        appId: oauth.appId,
      }),
    };
  }
  if (step === "tiktok") {
    const oauth = tiktokOAuthConfig();
    return {
      next: "tiktok",
      brand_id: brand.id,
      chain: rest,
      authorization_url: tiktokAuthorizationUrl({
        state,
        redirectUri: oauth.redirectUri,
        clientKey: oauth.clientKey,
      }),
    };
  }
  throw socialError(400, "unsupported_platform", "Connect step is not supported.");
}

export async function continueConnectChain(brandId, chain, now = Date.now()) {
  const brand = requireBrand(brandId);
  const wanted = cleanConnectChain(chain);
  const stillMissing = await missingConnectSteps(brand.id);
  const remaining = wanted.length ? wanted.filter((step) => stillMissing.includes(step)) : stillMissing;
  if (!remaining.length) {
    return { done: true, brand_id: brand.id, message: "All accounts for this brand are connected." };
  }
  const next = remaining[0];
  return beginConnectStep(next, brand.id, { chain: remaining.slice(1), now });
}

/** Closest thing to one-click: start the first missing login; the OAuth callback continues the chain. */
export async function beginConnectAll(brandId, now = Date.now()) {
  return continueConnectChain(brandId, await missingConnectSteps(brandId), now);
}

export async function beginYouTubeConnect(brandId, options = {}) {
  const now = options.now || Date.now();
  return beginConnectStep("youtube", brandId, { chain: options.chain || [], now });
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
  assertOwnedAccount(brand, "youtube", channel.channel_id);
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
  return { brand_id: brand.id, chain: cleanConnectChain(payload.chain), finished: "youtube" };
}

export async function beginMetaConnect(brandId, options = {}) {
  const now = options.now || Date.now();
  return beginConnectStep("meta", brandId, { chain: options.chain || [], now });
}

export async function completeMetaOAuth({ code, state, fetchImpl = fetch, now = Date.now() }) {
  const payload = verifySocialState(state);
  if (payload?.v !== 1 || payload.platform !== "meta" || !payload.nonce || !payload.brand_id) {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now) {
    throw socialError(400, "invalid_state", "The connection attempt expired. Try again.");
  }
  const brand = requireBrand(payload.brand_id);
  const stored = await takeNonce(payload.nonce);
  if (stored !== brand.id) throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  if (!code || String(code).length > 2048) throw socialError(400, "oauth_failed", "Meta did not return an authorization code.");
  const oauth = metaOAuthConfig();
  const tokens = await exchangeMetaCode({
    code: String(code),
    redirectUri: oauth.redirectUri,
    appId: oauth.appId,
    appSecret: oauth.appSecret,
    fetchImpl,
  });
  const pages = await fetchMetaPages({ accessToken: tokens.access_token, fetchImpl });
  const expectedInstagram = expectedAccount(brand, "instagram");
  let page = null;
  if (expectedInstagram?.id) {
    page = pages.find((item) => item.instagram_id === expectedInstagram.id) || null;
    if (!page) throw socialError(409, "account_mismatch", `That Meta login does not include ${expectedInstagram.label}.`);
  } else if (pages.length === 1) {
    page = pages[0];
  } else {
    throw socialError(409, "ambiguous_page", "That Meta login can access more than one Page. Connect the login that owns the Page you want.");
  }
  const stamp = new Date(now).toISOString();
  const facebookRecord = {
    brand_id: brand.id,
    platform: "facebook",
    account_label: page.name,
    page_id: page.id,
    channel_id: page.id,
    access_token: page.access_token,
    expires_at: tokens.expires_at,
    connected_at: stamp,
    updated_at: stamp,
  };
  await saveConnectionEnvelope(brand.id, "facebook", encryptSocialJson(facebookRecord, "social-connection"));
  if (page.instagram_id) {
    assertOwnedAccount(brand, "instagram", page.instagram_id);
    const instagramRecord = {
      brand_id: brand.id,
      platform: "instagram",
      account_label: page.instagram_username ? `@${page.instagram_username}` : page.instagram_id,
      instagram_id: page.instagram_id,
      page_id: page.id,
      channel_id: page.instagram_id,
      access_token: page.access_token,
      expires_at: tokens.expires_at,
      connected_at: stamp,
      updated_at: stamp,
    };
    await saveConnectionEnvelope(brand.id, "instagram", encryptSocialJson(instagramRecord, "social-connection"));
  }
  await audit("oauth_connected", {
    actor: "owner",
    brandId: brand.id,
    detail: {
      platform: "meta",
      page_id: page.id,
      account_label: page.name,
      instagram_id: page.instagram_id || null,
    },
    now,
  });
  return { brand_id: brand.id, chain: cleanConnectChain(payload.chain), finished: "meta" };
}

export async function beginTikTokConnect(brandId, options = {}) {
  const now = options.now || Date.now();
  return beginConnectStep("tiktok", brandId, { chain: options.chain || [], now });
}

export async function completeTikTokOAuth({ code, state, fetchImpl = fetch, now = Date.now() }) {
  const payload = verifySocialState(state);
  if (payload?.v !== 1 || payload.platform !== "tiktok" || !payload.nonce || !payload.brand_id) {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now) {
    throw socialError(400, "invalid_state", "The connection attempt expired. Try again.");
  }
  const brand = requireBrand(payload.brand_id);
  const stored = await takeNonce(payload.nonce);
  if (stored !== brand.id) throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  if (!code || String(code).length > 2048) throw socialError(400, "oauth_failed", "TikTok did not return an authorization code.");
  const oauth = tiktokOAuthConfig();
  const tokens = await exchangeTikTokCode({
    code: String(code),
    redirectUri: oauth.redirectUri,
    clientKey: oauth.clientKey,
    clientSecret: oauth.clientSecret,
    fetchImpl,
  });
  const user = await fetchTikTokUser({ accessToken: tokens.access_token, fetchImpl });
  const record = {
    brand_id: brand.id,
    platform: "tiktok",
    account_label: user.account_label,
    open_id: user.open_id || tokens.open_id,
    channel_id: user.open_id || tokens.open_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    scope: tokens.scope,
    connected_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  await saveConnectionEnvelope(brand.id, "tiktok", encryptSocialJson(record, "social-connection"));
  await audit("oauth_connected", {
    actor: "owner",
    brandId: brand.id,
    detail: { platform: "tiktok", account_label: user.account_label, open_id: record.open_id },
    now,
  });
  return { brand_id: brand.id, chain: cleanConnectChain(payload.chain), finished: "tiktok" };
}

export async function completeSocialOAuth(input) {
  const payload = verifySocialState(input?.state);
  if (payload?.platform === "meta") return completeMetaOAuth(input);
  if (payload?.platform === "tiktok") return completeTikTokOAuth(input);
  return completeYouTubeOAuth(input);
}

/**
 * Approve (if needed), schedule for now or a chosen time. Owner then runs Publish due, or the
 * admin action can kick one slice. Agents still cannot approve or publish.
 */
export async function publishPostNow(postId, { overrideReason = "", scheduledAt = null, privacy = null } = {}, now = Date.now()) {
  let post = await requireOwnerPost(postId);
  if (privacy) {
    await setPostPrivacy(postId, privacy, now);
    post = await requireOwnerPost(postId);
  }
  if (REVIEWABLE_STATUSES.includes(post.status)) {
    post = await approvePost(postId, overrideReason, now);
  } else if (post.status === "failed" || post.status === "handed_off") {
    post = await retryPost(postId, now);
  }
  if (!["approved", "scheduled"].includes(post.status)) {
    throw socialError(409, "not_publishable", "Approve or schedule this post before publishing.");
  }
  const when = scheduledAt ? cleanTimestamp(scheduledAt, "Schedule") : new Date(now).toISOString();
  return schedulePost(postId, when, now);
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

function oauthBundle(platform) {
  if (platform === "youtube") {
    const google = googleOAuthConfig();
    return { provider: "google", clientId: google.clientId, clientSecret: google.clientSecret };
  }
  if (platform === "instagram" || platform === "facebook") {
    const meta = metaOAuthConfig();
    return { provider: "meta", clientId: meta.appId, clientSecret: meta.appSecret };
  }
  if (platform === "tiktok") {
    const tiktok = tiktokOAuthConfig();
    return { provider: "tiktok", clientKey: tiktok.clientKey, clientSecret: tiktok.clientSecret };
  }
  return {};
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
    if (!envelope) throw socialError(409, "not_connected", `${publisher.label} is not connected for this brand.`);
    const secrets = decryptSocialJson(envelope, "social-connection");
    const jobEnvelope = await getJobEnvelope(post.id);
    const job = jobEnvelope ? decryptSocialJson(jobEnvelope, "social-upload-session") : null;
    const oauth = oauthBundle(post.platform);
    const result = await publisher.publishSlice({
      post,
      secrets,
      job,
      readRange: deps.readRange || readSocialBlobRange,
      fetchImpl: deps.fetchImpl || fetch,
      oauth,
      now,
      deadline: now + (deps.budgetMs || PUBLISH_BUDGET_MS),
      stage: "publish",
      deleteAsset: deps.deleteAsset || deleteSocialBlob,
    });
    await saveConnectionEnvelope(post.brand_id, post.platform, encryptSocialJson({
      ...secrets,
      access_token: result.secrets?.access_token || secrets.access_token,
      expires_at: result.secrets?.expires_at || secrets.expires_at,
      refresh_token: result.secrets?.refresh_token || secrets.refresh_token,
      updated_at: new Date(now).toISOString(),
    }, "social-connection"));
    if (result.job) await saveJobEnvelope(post.id, encryptSocialJson(result.job, "social-upload-session"));
    if (result.drafted && result.job?.video_id && post.platform === "youtube") {
      post.platform_draft = { status: "ready", video_id: result.job.video_id, updated_at: new Date(now).toISOString() };
      markAssetsGone(post, now);
    }
    if (result.handoff) {
      post.status = "handed_off";
      post.platform_ref = result.ref || post.platform_ref || null;
      post.published_url = null;
      post.error = result.message || null;
      if (result.releaseAssets) await dropTempAssets(post, deps.deleteAsset || deleteSocialBlob, now);
    } else if (result.done) {
      post.status = "published";
      post.published_url = result.publishedUrl;
      post.platform_ref = result.job?.video_id || post.platform_ref || null;
      post.error = null;
      if (result.releaseAssets || post.platform === "youtube") {
        await dropTempAssets(post, deps.deleteAsset || deleteSocialBlob, now);
      }
    } else if (result.message) {
      post.status = "failed";
      post.error = result.message;
    } else {
      post.status = "publishing";
    }
    post.publish_lock_until = null;
    post.updated_at = new Date().toISOString();
    await savePost(post);
    const auditAction = result.done ? "published" : result.handoff ? "handed_off" : result.message ? "publish_failed" : "publish_progress";
    await audit(auditAction, {
      actor,
      brandId: post.brand_id,
      postId: post.id,
      detail: {
        bytes_uploaded: result.job?.next_byte || 0,
        total_bytes: result.job?.total_bytes || post.video_asset.size,
      },
      now,
    });
    const more = result.done || result.handoff || result.message
      ? (await listDuePosts(Date.now())).length > 0
      : true;
    return {
      continued: more,
      post_id: post.id,
      status: post.status,
      bytes_uploaded: result.job?.next_byte || 0,
      total_bytes: result.job?.total_bytes || post.video_asset.size,
      published_url: result.done ? result.publishedUrl : null,
      message: result.message || null,
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
    if (!envelope) throw socialError(409, "not_connected", "YouTube is not connected for this brand.");
    const secrets = decryptSocialJson(envelope, "social-connection");
    const jobEnvelope = await getJobEnvelope(post.id);
    const job = jobEnvelope ? decryptSocialJson(jobEnvelope, "social-upload-session") : null;
    const oauth = oauthBundle(post.platform);
    const result = await publisherFor(post.platform).publishSlice({
      post,
      secrets,
      job,
      readRange: deps.readRange || readSocialBlobRange,
      fetchImpl: deps.fetchImpl || fetch,
      oauth,
      now,
      deadline: now + (deps.budgetMs || PUBLISH_BUDGET_MS),
      stage: "draft",
      deleteAsset: deps.deleteAsset || deleteSocialBlob,
    });
    await saveConnectionEnvelope(post.brand_id, post.platform, encryptSocialJson({
      ...secrets,
      access_token: result.secrets?.access_token || secrets.access_token,
      expires_at: result.secrets?.expires_at || secrets.expires_at,
      refresh_token: result.secrets?.refresh_token || secrets.refresh_token,
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
    const code = error.code || "";
    if (code === "not_connected" || code === "social_not_configured" || code === "youtube_not_connected") {
      post.platform_draft = null;
      post.draft_lock_until = null;
      await savePost(post);
      return { continued: false, post_id: post.id, status: post.status, message: error.message };
    }
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
