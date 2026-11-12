import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { approveDesktopPair, desktopPairReview, desktopPairStatus, listDesktopDevices, parseDesktopCredential, revokeDesktopDevice, startDesktopPair } from "../lib/admin/desktopDevice.js";
import { checkRateLimit, rejectIfRateLimited, setRateLimitHeaders } from "../lib/http/rateLimit.js";

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
export default async function handler(req, res) {
  const url = new URL(req.url, "https://www.1ststep.ai");
  const action = url.searchParams.get("action");
  try {
    if (req.method === "GET" && action === "status") {
      if (rejectIfRateLimited(req, res, "admin-read", respond)) return;
      return respond(res, 200, { ok: true, ...await desktopPairStatus(req) });
    }
    if (req.method === "GET" && ["review", "devices"].includes(action)) {
      if (rejectIfRateLimited(req, res, "admin-read", respond)) return;
      if (!isAdminAuthenticated(req)) return respond(res, 401, { ok: false, code: "unauthorized" });
      return respond(res, 200, { ok: true, ...(action === "review" ? { pairing: await desktopPairReview(url.searchParams.get("id")) } : { devices: await listDesktopDevices() }) });
    }
    if (req.method === "POST" && action === "start") {
      const limit = checkRateLimit(req, "desktop-start"); setRateLimitHeaders(res, limit);
      if (!limit.allowed) return respond(res, 429, { ok: false, message: "Too many pairing requests. Wait and retry." });
      // A native client supplies no Origin. Reject web origins other than our owner page.
      if (req.headers.origin && !isSameOriginRequest(req)) return respond(res, 403, { ok: false, code: "origin_not_allowed" });
    } else if (req.method === "POST" && action === "approve") {
      if (!isAdminAuthenticated(req)) return respond(res, 401, { ok: false, code: "unauthorized" });
      if (!isSameOriginRequest(req)) return respond(res, 403, { ok: false, code: "origin_not_allowed" });
      const limit = checkRateLimit(req, "desktop-approve"); setRateLimitHeaders(res, limit);
      if (!limit.allowed) return respond(res, 429, { ok: false, message: "Too many code attempts. Wait and retry." });
    } else if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (isAdminAuthenticated(req)) {
        if (!isSameOriginRequest(req)) return respond(res, 403, { ok: false, code: "origin_not_allowed" });
      } else {
        const status = await desktopPairStatus(req);
        if (status.id !== id || parseDesktopCredential(req)?.id !== id) return respond(res, 403, { ok: false, code: "device_mismatch" });
      }
      await revokeDesktopDevice(id);
      return respond(res, 200, { ok: true });
    } else return respond(res, 405, { ok: false, code: "method_not_allowed" });
    if (!String(req.headers["content-type"] || "").includes("application/json")) return respond(res, 415, { ok: false, code: "json_required" });
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw) > 2048) return respond(res, 413, { ok: false, code: "payload_too_large" });
    const body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
    return respond(res, 200, { ok: true, ...(action === "start" ? { pairing: await startDesktopPair(body.secret_hash) } : { device: await approveDesktopPair(body.id, body.code) }) });
  } catch (error) {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : 503);
    return respond(res, status, { ok: false, message: status >= 500 ? "Pairing service is unavailable. Your data has not changed; retry later." : error.message });
  }
}
