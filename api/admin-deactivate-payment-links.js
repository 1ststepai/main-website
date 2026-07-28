import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import { deactivateQuotePaymentLinks } from "../lib/admin/stripePayments.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";

const MAX_BODY_BYTES = 4 * 1024;

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

function quoteIdentifier(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    const error = new Error("Invalid quote identifier");
    error.code = "invalid_quote_id";
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function removeLinks(workspace, quoteId, linkIds, updatedAt) {
  return {
    ...workspace,
    quotes: workspace.quotes.map((quote) => quote.id === quoteId ? {
      ...quote,
      payment_links: (quote.payment_links || []).filter(
        (link) => !linkIds.has(link.stripe_payment_link_id)
      ),
      updated_at: updatedAt,
    } : quote),
  };
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
    const quoteId = quoteIdentifier(parseBody(req).quote_id);
    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendJson(res, 404, { ok: false, code: "quote_not_found" });
    const paymentLinks = quote.payment_links || [];
    if (!paymentLinks.length) {
      return sendJson(res, 200, { ok: true, deactivated: 0, workspace });
    }

    const linkIds = new Set(paymentLinks.map((link) => link.stripe_payment_link_id));
    const deactivated = await deactivateQuotePaymentLinks(paymentLinks);
    const updatedAt = new Date().toISOString();
    try {
      const saved = await saveAdminWorkspace(
        removeLinks(workspace, quoteId, linkIds, updatedAt),
        workspace.revision
      );
      console.log(JSON.stringify({
        event: "admin_quote_payment_links_deactivated",
        quote_id: quoteId,
        count: deactivated,
      }));
      return sendJson(res, 200, { ok: true, deactivated, workspace: saved });
    } catch (error) {
      if (error.code !== "revision_conflict") throw error;
      const latest = await loadAdminWorkspace();
      const saved = await saveAdminWorkspace(
        removeLinks(latest, quoteId, linkIds, updatedAt),
        latest.revision
      );
      return sendJson(res, 200, { ok: true, deactivated, workspace: saved });
    }
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    if (statusCode >= 500) {
      console.error(JSON.stringify({
        event: "admin_quote_payment_link_deactivation_failed",
        code: error.code || "internal_error",
      }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: statusCode >= 500
        ? "Card links could not be deactivated. No quote changes were saved."
        : error.message,
    });
  }
}
