import { assertAgent, enforceRateLimit, readJsonBody, requireJson, runSocial, sendJson } from "../../lib/social/http.js";
import { issueUploadForToken } from "../../lib/social/service.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }
  return runSocial(res, async () => {
    enforceRateLimit(req, res, "social-upload", 60);
    requireJson(req);
    const token = await assertAgent(req);
    const upload = await issueUploadForToken(token, readJsonBody(req));
    sendJson(res, 200, { ok: true, upload });
  });
}
