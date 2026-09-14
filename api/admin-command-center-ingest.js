import {
  authorizeCommandCenterPublisher,
  normalizeCommandCenterSource,
  saveCommandCenterSource,
} from "../lib/admin/commandCenter.js";

const MAX_BODY_BYTES = 128 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!String(req.headers?.["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return send(res, 415, { ok: false, code: "json_required" });
  }
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return send(res, 413, { ok: false, code: "payload_too_large" });
  let input;
  try { input = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return send(res, 400, { ok: false, code: "invalid_json" }); }
  if (!authorizeCommandCenterPublisher(req, input?.source)) return send(res, 401, { ok: false, code: "unauthorized" });
  try {
    const snapshot = normalizeCommandCenterSource(input);
    await saveCommandCenterSource(snapshot);
    return send(res, 200, { ok: true, source: snapshot.source, observedAt: snapshot.observedAt });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    return send(res, status, { ok: false, code: error.code || "internal_error" });
  }
}
