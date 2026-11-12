import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { isDesktopAuthenticated } from "../lib/admin/desktopDevice.js";
import { MAX_PIPELINE_BYTES } from "../lib/admin/newsletterPipeline.js";
import { loadNewsletterPipeline, changeNewsletterPipeline } from "../lib/admin/newsletterPipelineStore.js";
import { rejectIfRateLimited } from "../lib/http/rateLimit.js";

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
export function pipelineHandler(service = "newsletter") { return async function handler(req, res) {
  if (!isAdminAuthenticated(req) && !await isDesktopAuthenticated(req, "pipeline")) return respond(res, 401, { ok: false, code: "unauthorized" });
  if (!["GET", "POST"].includes(req.method)) { res.setHeader("Allow", "GET, POST"); return respond(res, 405, { ok: false, code: "method_not_allowed" }); }
  if (rejectIfRateLimited(req, res, req.method === "GET" ? "admin-read" : "admin-write", respond)) return;
  try {
    if (req.method === "GET") return respond(res, 200, { ok: true, pipeline: await loadNewsletterPipeline(service) });
    if (!isSameOriginRequest(req)) return respond(res, 403, { ok: false, code: "origin_not_allowed" });
    if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) return respond(res, 415, { ok: false, code: "json_required" });
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw, "utf8") > MAX_PIPELINE_BYTES) return respond(res, 413, { ok: false, message: "Import exceeds 2 MiB. Split the file into smaller batches." });
    const body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
    if (!Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0) return respond(res, 400, { ok: false, code: "invalid_revision" });
    return respond(res, 200, { ok: true, pipeline: await changeNewsletterPipeline(body, body.expected_revision, service) });
  } catch (error) {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    return respond(res, status, { ok: false, code: error.code || "invalid_request", message: status >= 500 ? "Pipeline storage is unavailable. Your draft has not been saved; retry when storage returns." : error.message });
  }
}; }
export default pipelineHandler();
