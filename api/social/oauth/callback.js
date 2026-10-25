import { enforceRateLimit, requestQuery } from "../../../lib/social/http.js";
import { completeYouTubeOAuth } from "../../../lib/social/service.js";

function redirect(res, params) {
  const search = new URLSearchParams(params);
  res.statusCode = 302;
  res.setHeader("Location", `/admin/?${search.toString()}`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  try {
    enforceRateLimit(req, res, "social-oauth", 30);
    const query = requestQuery(req);
    if (query.get("error")) {
      return redirect(res, { page: "social", social_oauth: "error", reason: "access_denied" });
    }
    const brandId = await completeYouTubeOAuth({
      code: query.get("code"),
      state: query.get("state"),
    });
    return redirect(res, { page: "social", social_oauth: "connected", brand: brandId });
  } catch (error) {
    const reason = String(error.code || "oauth_failed").replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "oauth_failed";
    return redirect(res, { page: "social", social_oauth: "error", reason });
  }
}
