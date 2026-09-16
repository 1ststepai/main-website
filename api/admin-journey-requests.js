import { isAdminAuthenticated } from "../lib/admin/auth.js";
import { listJourneyRequests } from "../lib/journey/intakeStore.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (!isAdminAuthenticated(req)) return reply(401, { ok: false, code: "unauthorized" });
  if (req.method !== "GET") return reply(405, { ok: false, code: "method_not_allowed" });
  try {
    const cursor = typeof req.query?.cursor === "string" ? req.query.cursor : "0";
    return reply(200, { ok: true, ...(await listJourneyRequests(cursor)) });
  } catch (error) {
    return reply(Number(error.statusCode) || 503, { ok: false, code: error.code || "intake_unavailable" });
  }
}
