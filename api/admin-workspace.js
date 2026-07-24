import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";

const MAX_BODY_BYTES = 512 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Workspace is too large");
    error.statusCode = 413;
    error.code = "payload_too_large";
    throw error;
  }
  return typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
}

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return sendJson(res, 401, { ok: false, code: "unauthorized" });
  }
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }

  try {
    if (req.method === "GET") {
      return sendJson(res, 200, { ok: true, workspace: await loadAdminWorkspace() });
    }
    if (!isSameOriginRequest(req)) {
      return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
      return sendJson(res, 415, { ok: false, code: "json_required" });
    }
    const body = parseBody(req);
    const expectedRevision = Number(body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return sendJson(res, 400, { ok: false, code: "invalid_revision" });
    }
    const workspace = await saveAdminWorkspace(body.workspace, expectedRevision);
    return sendJson(res, 200, { ok: true, workspace });
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: statusCode >= 500 ? "The admin workspace is unavailable." : error.message,
    });
  }
}
