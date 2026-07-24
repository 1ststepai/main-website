import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { sendQuoteEmail } from "../lib/admin/sendQuoteEmail.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";

const MAX_BODY_BYTES = 8 * 1024;

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
    const error = new Error("Request body is too large");
    error.code = "payload_too_large";
    error.statusCode = 413;
    throw error;
  }
  return typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
}

function identifier(value, name, maximum = 180) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum || !/^[a-zA-Z0-9_/:.-]+$/.test(normalized)) {
    const error = new Error(`Invalid ${name}`);
    error.code = `invalid_${name}`;
    error.statusCode = 400;
    throw error;
  }
  return normalized;
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
    const body = parseBody(req);
    const quoteId = identifier(body.quote_id, "quote_id", 80);
    const idempotencyKey = identifier(body.idempotency_key, "idempotency_key", 256);
    const note = String(body.note || "").trim();
    if (note.length > 1600) {
      const error = new Error("Email note is too long");
      error.code = "note_too_long";
      error.statusCode = 400;
      throw error;
    }

    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendJson(res, 404, { ok: false, code: "quote_not_found" });
    const client = workspace.clients.find((item) => item.id === quote.client_id);
    if (!client) return sendJson(res, 409, { ok: false, code: "client_not_found" });

    const delivery = await sendQuoteEmail({ quote, client, note, idempotencyKey });
    const sentAt = new Date().toISOString();
    const updated = {
      ...workspace,
      quotes: workspace.quotes.map((item) => item.id === quote.id ? {
        ...item,
        status: "sent",
        sent_at: sentAt,
        delivery_id: delivery.id,
        updated_at: sentAt,
      } : item),
    };

    try {
      const saved = await saveAdminWorkspace(updated, workspace.revision);
      console.log(JSON.stringify({ event: "admin_quote_sent", quote_id: quote.id, delivery_id: delivery.id }));
      return sendJson(res, 200, { ok: true, sent: true, status_saved: true, workspace: saved });
    } catch (error) {
      if (error.code !== "revision_conflict") throw error;
      console.warn(JSON.stringify({ event: "admin_quote_sent_status_conflict", quote_id: quote.id, delivery_id: delivery.id }));
      return sendJson(res, 200, {
        ok: true,
        sent: true,
        status_saved: false,
        delivery_id: delivery.id,
        message: "The email was sent, but the quote status changed in another tab. Refresh the workspace.",
      });
    }
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    if (statusCode >= 500) console.error(JSON.stringify({ event: "admin_quote_send_failed", code: error.code || "internal_error" }));
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: statusCode >= 500 ? "Quote email delivery is unavailable." : error.message,
    });
  }
}
