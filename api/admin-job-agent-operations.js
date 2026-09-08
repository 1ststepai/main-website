import { isAdminAuthenticated } from "../lib/admin/auth.js";
import { loadJobAgentOperations } from "../lib/admin/jobAgentOperations.js";

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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  try {
    const operations = await loadJobAgentOperations({
      secret: process.env.JOB_AGENT_OPERATOR_BRIDGE_SECRET,
    });
    return sendJson(res, 200, { ok: true, operations });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    console.error(JSON.stringify({
      type: "job-agent-admin-operations-error",
      code: error.code || "internal_error",
      status: statusCode,
    }));
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || "internal_error",
      message: statusCode === 503
        ? "Job Agent operations access is not configured."
        : "Live Job Agent operations are temporarily unavailable.",
    });
  }
}
