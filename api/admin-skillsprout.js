import { isAdminAuthenticated } from "../lib/admin/auth.js";
import { listSkillSproutContacts } from "../lib/admin/skillsproutStore.js";
import { respond } from "./skillsprout-intake.js";
export default async function handler(req, res) {
  try {
    if (!isAdminAuthenticated(req)) return respond(res, 401, { ok: false, code: "unauthorized" });
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return respond(res, 405, { ok: false, code: "method_not_allowed" }); }
    const offset = Number(new URL(req.url, "https://admin.local").searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return respond(res, 400, { ok: false, code: "invalid_offset" });
    return respond(res, 200, { ok: true, contacts: await listSkillSproutContacts(offset) });
  } catch { return respond(res, 503, { ok: false, code: "storage_unavailable" }); }
}
