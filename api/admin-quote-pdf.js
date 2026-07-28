import { isAdminAuthenticated } from "../lib/admin/auth.js";
import { generateQuotePdf, quotePdfFilename } from "../lib/admin/quotePdf.js";
import { loadAdminWorkspace } from "../lib/admin/workspaceStore.js";

function setPrivateHeaders(res) {
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  setPrivateHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function quoteIdentifier(req) {
  const raw = Array.isArray(req.query?.quote_id) ? req.query.quote_id[0] : req.query?.quote_id;
  const value = String(raw || "").trim();
  if (!value || value.length > 80 || !/^[a-zA-Z0-9_.:-]+$/.test(value)) {
    const error = new Error("Invalid quote identifier");
    error.code = "invalid_quote_id";
    error.statusCode = 400;
    throw error;
  }
  return value;
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
    const quoteId = quoteIdentifier(req);
    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendJson(res, 404, { ok: false, code: "quote_not_found" });
    const client = workspace.clients.find((item) => item.id === quote.client_id);
    if (!client) return sendJson(res, 409, { ok: false, code: "client_not_found" });

    const bytes = Buffer.from(await generateQuotePdf({ quote, client }));
    const filename = quotePdfFilename(quote);
    res.statusCode = 200;
    setPrivateHeaders(res);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.end(bytes);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) {
      console.error(JSON.stringify({
        event: "admin_quote_pdf_failed",
        code: error.code || "internal_error",
      }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || "internal_error",
      message: statusCode >= 500 ? "The quote PDF is unavailable." : error.message,
    });
  }
}
