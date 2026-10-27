import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { normalizeHandoffBoard } from "../lib/admin/agentHandoff.js";
import { loadAgentHandoffBoard, saveAgentHandoffBoard } from "../lib/admin/agentHandoffStore.js";
import { studioBridgeView, describeServerConnections } from "../lib/admin/handoffConnections.js";
import { evaluateToolChoice } from "../lib/admin/toolChoice.js";

const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

function storageFailure(error) {
  const statusCode = Number(error.statusCode) || 503;
  return {
    state: error.code === "handoff_storage_not_configured" ? "not_configured" : "unavailable",
    message: statusCode >= 500
      ? "Handoff storage is unavailable. Nothing was invented in its place."
      : error.message,
  };
}

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return sendJson(res, 401, { ok: false, code: "unauthorized" });
  }
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }

  if (req.method === "GET") {
    const [storageResult, bridge] = await Promise.all([
      loadAgentHandoffBoard()
        .then((board) => ({ state: "ready", board }))
        .catch((error) => ({ ...storageFailure(error), board: null })),
      studioBridgeView({ env: process.env }),
    ]);
    return sendJson(res, 200, {
      ok: true,
      storage: { state: storageResult.state, message: storageResult.message || "" },
      board: storageResult.board,
      bridge,
      connections: describeServerConnections({ snapshot: bridge, env: process.env }),
    });
  }

  if (!isSameOriginRequest(req)) {
    return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { ok: false, code: "json_required" });
  }
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return sendJson(res, 413, { ok: false, code: "payload_too_large" });
    }
    const body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
    const expectedRevision = Number(body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return sendJson(res, 400, { ok: false, code: "invalid_revision" });
    }
    normalizeHandoffBoard(body.board, evaluateToolChoice);
    const board = await saveAgentHandoffBoard(body.board, expectedRevision);
    return sendJson(res, 200, { ok: true, board });
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    if (statusCode >= 500) {
      console.error(JSON.stringify({
        type: "admin-handoff-save-error",
        code: error.code || "internal_error",
        status: statusCode,
      }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: statusCode >= 500 ? "Handoff storage is unavailable." : error.message,
    });
  }
}
