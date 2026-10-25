import { timingSafeEqual } from "node:crypto";
import { socialError } from "../../lib/social/errors.js";
import { enforceRateLimit, runSocial, sendJson } from "../../lib/social/http.js";
import { getRequestHeader } from "../../lib/http/cors.js";
import { publishDueSlice } from "../../lib/social/service.js";

function secretMatches(provided) {
  const expected = String(process.env.SOCIAL_CRON_SECRET || "");
  if (expected.length < 24) {
    throw socialError(503, "social_not_configured", "SOCIAL_CRON_SECRET is not configured");
  }
  const left = Buffer.from(String(provided || ""));
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }
  return runSocial(res, async () => {
    enforceRateLimit(req, res, "social-cron", 120);
    const header = getRequestHeader(req, "authorization") || "";
    const bearer = /^Bearer\s+(\S+)$/i.exec(header);
    if (!bearer || !secretMatches(bearer[1])) {
      throw socialError(401, "unauthorized", "Cron secret is required.");
    }
    const progress = await publishDueSlice({ actor: "cron" });
    sendJson(res, 200, { ok: true, ...progress });
  });
}
