import { socialError } from "../errors.js";

// Facebook Page video as an UNPUBLISHED post (platform draft).
// Docs: https://developers.facebook.com/docs/graph-api/reference/page/videos/
//   POST /{page_id}/videos with published=false, file_url=<accessible URL>.
// The resumable "transfer" phase needs the Page access token on every chunk,
// so bytes cannot be handed to an untrusted uploader. Fallback: temporary
// private Blob + short-lived signed file_url, then delete the blob once
// Facebook returns a video id. Not wired yet: no Facebook Page OAuth in this PR.

export function facebookUnpublishedVideoParams({ fileUrl, title, description }) {
  let url;
  try {
    url = new URL(fileUrl);
  } catch {
    throw socialError(400, "invalid_asset", "file_url is invalid.");
  }
  if (url.protocol !== "https:") throw socialError(400, "invalid_asset", "file_url must be https.");
  const params = new URLSearchParams();
  params.set("file_url", url.toString());
  params.set("published", "false");
  if (title) params.set("title", String(title).slice(0, 255));
  if (description) params.set("description", String(description));
  return params;
}

export async function createFacebookDraftVideo({ pageId, pageToken, fileUrl, title, description, fetchImpl = fetch, version = "v21.0" }) {
  if (!/^\d+$/.test(String(pageId || ""))) throw socialError(400, "invalid_field", "Facebook Page id is invalid.");
  const params = facebookUnpublishedVideoParams({ fileUrl, title, description });
  params.set("access_token", pageToken);
  const response = await fetchImpl(`https://graph.facebook.com/${version}/${pageId}/videos`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = typeof response.json === "function" ? await response.json().catch(() => ({})) : {};
  if (!response.ok || !payload.id) {
    throw socialError(502, "facebook_upload_failed", String(payload?.error?.message || `Facebook upload failed (${response.status})`).slice(0, 300));
  }
  return { video_id: payload.id };
}
