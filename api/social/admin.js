import {
  assertOwner,
  enforceRateLimit,
  readJsonBody,
  requestQuery,
  runSocial,
  sendJson,
} from "../../lib/social/http.js";
import {
  approvePost,
  beginYouTubeConnect,
  createApiToken,
  disconnectPlatform,
  loadDesk,
  publishDueSlice,
  rejectPost,
  restartUpload,
  retryPost,
  revokeApiToken,
  schedulePost,
  setPostPrivacy,
} from "../../lib/social/service.js";
import { socialError } from "../../lib/social/errors.js";

async function deskResponse(res, brandId, extra = {}) {
  const desk = await loadDesk(brandId);
  sendJson(res, 200, { ok: true, ...extra, desk });
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }
  return runSocial(res, async () => {
    assertOwner(req, { write: req.method === "POST" });
    enforceRateLimit(req, res, "social-admin", 1000);
    if (req.method === "GET") {
      const brandId = requestQuery(req).get("brand_id");
      return deskResponse(res, brandId || undefined);
    }
    const body = readJsonBody(req);
    const action = String(body.action || "");
    if (action === "create_token") {
      const created = await createApiToken(body.brand_id, body.label);
      return deskResponse(res, body.brand_id, { secret: created.secret, token_record: created.token });
    }
    if (action === "revoke_token") {
      const token = await revokeApiToken(body.token_id);
      return deskResponse(res, body.brand_id || token.brand_id);
    }
    if (action === "disconnect") {
      await disconnectPlatform(body.brand_id, body.platform);
      return deskResponse(res, body.brand_id);
    }
    if (action === "connect_youtube") {
      const connection = await beginYouTubeConnect(body.brand_id);
      return deskResponse(res, body.brand_id, connection);
    }
    if (action === "approve") {
      const post = await approvePost(body.post_id, body.override_reason);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "reject") {
      const post = await rejectPost(body.post_id, body.reason);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "schedule") {
      const post = await schedulePost(body.post_id, body.scheduled_at);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "set_privacy") {
      const post = await setPostPrivacy(body.post_id, body.privacy_status);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "retry_publish") {
      const post = await retryPost(body.post_id);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "restart_upload") {
      const post = await restartUpload(body.post_id);
      return deskResponse(res, body.brand_id || post.brand_id, { post });
    }
    if (action === "publish_due") {
      const progress = await publishDueSlice({ actor: "owner" });
      return deskResponse(res, body.brand_id, progress);
    }
    throw socialError(400, "invalid_action", "Unknown action.");
  });
}
