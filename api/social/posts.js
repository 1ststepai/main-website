import {
  assertAgent,
  enforceRateLimit,
  readJsonBody,
  requestQuery,
  requireJson,
  runSocial,
  sendJson,
} from "../../lib/social/http.js";
import { createPostForToken, listPostsForToken, updatePostForToken } from "../../lib/social/service.js";
import { socialError } from "../../lib/social/errors.js";

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }
  return runSocial(res, async () => {
    enforceRateLimit(req, res, "social-agent", 60);
    const token = await assertAgent(req);
    if (req.method === "GET") {
      const posts = await listPostsForToken(token);
      const id = requestQuery(req).get("id");
      if (!id) return sendJson(res, 200, { ok: true, brand_id: token.brand_id, posts });
      const post = posts.find((item) => item.id === id);
      if (!post) throw socialError(404, "not_found", "Post not found.");
      return sendJson(res, 200, { ok: true, post });
    }
    requireJson(req);
    const body = readJsonBody(req);
    if (req.method === "POST") {
      const post = await createPostForToken(token, body);
      return sendJson(res, 201, { ok: true, post });
    }
    const postId = requestQuery(req).get("id") || body.id;
    if (!postId) throw socialError(400, "invalid_request", "Post id is required.");
    const post = await updatePostForToken(token, postId, body);
    return sendJson(res, 200, { ok: true, post });
  });
}
