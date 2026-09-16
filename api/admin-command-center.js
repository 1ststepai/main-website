import { isAdminAuthenticated } from "../lib/admin/auth.js";
import { loadCommandCenter } from "../lib/admin/commandCenter.js";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) return send(res, 401, { ok: false, code: "unauthorized" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { ok: false, code: "method_not_allowed" });
  }
  try { return send(res, 200, { ok: true, commandCenter: await loadCommandCenter() }); }
  catch (error) {
    console.error(JSON.stringify({ type: "command-center-read-error", code: error.code || "internal_error" }));
    return send(res, 503, { ok: false, code: "telemetry_unavailable", message: "Command Center telemetry is unavailable." });
  }
}
