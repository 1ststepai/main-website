import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";
import { parseAdminJson, sendAdminFailure, sendAdminJson } from "../lib/admin/adminRequest.js";

const MAX_BODY_BYTES = 512 * 1024;

export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return sendAdminJson(res, 401, { ok: false, code: "unauthorized" });
  }
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return sendAdminJson(res, 405, { ok: false, code: "method_not_allowed" });
  }

  try {
    if (req.method === "GET") {
      return sendAdminJson(res, 200, { ok: true, workspace: await loadAdminWorkspace() });
    }
    if (!isSameOriginRequest(req)) {
      return sendAdminJson(res, 403, { ok: false, code: "origin_not_allowed" });
    }
    if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
      return sendAdminJson(res, 415, { ok: false, code: "json_required" });
    }
    const body = parseAdminJson(req, MAX_BODY_BYTES, "Workspace is too large");
    const expectedRevision = Number(body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return sendAdminJson(res, 400, { ok: false, code: "invalid_revision" });
    }
    const workspace = await saveAdminWorkspace(body.workspace, expectedRevision);
    return sendAdminJson(res, 200, { ok: true, workspace });
  } catch (error) {
    return sendAdminFailure(res, error, "The admin workspace is unavailable.");
  }
}
