import { isAdminAuthenticated, isSameOriginRequest } from "../lib/admin/auth.js";
import {
  createQuotePaymentLink,
  deactivateQuotePaymentLink,
} from "../lib/admin/stripePayments.js";
import { paymentScheduleForQuote } from "../lib/admin/paymentPlans.js";
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

  let createdLink = null;
  try {
    const body = parseBody(req);
    const quoteId = identifier(body.quote_id, "quote_id", 80);
    const idempotencyKey = identifier(body.idempotency_key, "idempotency_key", 256);
    const installmentNumber = Number(body.installment_number);
    if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 4) {
      return sendJson(res, 400, { ok: false, code: "invalid_installment" });
    }

    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendJson(res, 404, { ok: false, code: "quote_not_found" });
    const client = workspace.clients.find((item) => item.id === quote.client_id);
    if (!client) return sendJson(res, 409, { ok: false, code: "client_not_found" });

    const existingLink = (quote.payment_links || []).find(
      (link) => Number(link.installment_number) === installmentNumber
    );
    if (existingLink) {
      const currentInstallment = paymentScheduleForQuote(quote).find(
        (installment) => installment.installment_number === installmentNumber
      );
      if (!currentInstallment || Number(existingLink.amount) !== currentInstallment.amount) {
        return sendJson(res, 409, {
          ok: false,
          code: "payment_link_stale",
          message: "The saved payment link no longer matches this quote. Deactivate it in Stripe before creating a replacement.",
        });
      }
      return sendJson(res, 200, {
        ok: true,
        payment_link: existingLink,
        workspace,
      });
    }

    createdLink = await createQuotePaymentLink({
      quote,
      client,
      installmentNumber,
      idempotencyKey,
    });
    const updated = {
      ...workspace,
      quotes: workspace.quotes.map((item) => item.id === quote.id ? {
        ...item,
        payment_links: [
          ...(item.payment_links || []).filter(
            (link) => Number(link.installment_number) !== installmentNumber
          ),
          createdLink,
        ].sort((left, right) => left.installment_number - right.installment_number),
        updated_at: new Date().toISOString(),
      } : item),
    };
    const saved = await saveAdminWorkspace(updated, workspace.revision);
    console.log(JSON.stringify({
      event: "admin_payment_link_created",
      quote_id: quote.id,
      installment_number: installmentNumber,
      stripe_payment_link_id: createdLink.stripe_payment_link_id,
    }));
    return sendJson(res, 200, {
      ok: true,
      payment_link: createdLink,
      workspace: saved,
    });
  } catch (error) {
    if (createdLink?.stripe_payment_link_id) {
      await deactivateQuotePaymentLink(createdLink.stripe_payment_link_id).catch(() => {});
    }
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    if (statusCode >= 500) {
      console.error(JSON.stringify({
        event: "admin_payment_link_failed",
        code: error.code || "internal_error",
      }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: statusCode >= 500 ? "Secure card-link creation is unavailable." : error.message,
    });
  }
}
