import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { connectPlatform } from "../lib/admin/handoffConnections.js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return sendJson(res, 401, { ok: false, code: "unauthorized" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!isSameOriginRequest(req)) {
    return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { ok: false, code: "json_required" });
  }
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
    const platform = String(body.platform || "");
    if (!/^[a-z0-9-]{1,40}$/.test(platform)) {
      return sendJson(res, 400, { ok: false, code: "invalid_platform" });
    }
    const connection = await connectPlatform({
      platformId: platform,
      env: process.env,
      context: "server",
    });
    return sendJson(res, 200, { ok: true, connection });
  } catch (error) {
    console.error(JSON.stringify({
      type: "admin-handoff-connection-error",
      code: error.code || "internal_error",
    }));
    return sendJson(res, 500, {
      ok: false,
      code: "internal_error",
      message: "The connection check failed. No connection was assumed.",
    });
  }
}
