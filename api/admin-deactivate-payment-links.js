import { deactivateQuotePaymentLinks } from "../lib/admin/stripePayments.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";
import {
  guardAdminJsonPost,
  parseAdminJson,
  sendAdminFailure,
  sendAdminJson,
} from "../lib/admin/adminRequest.js";

const MAX_BODY_BYTES = 4 * 1024;

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
  if (!guardAdminJsonPost(req, res)) return;

  try {
    const quoteId = quoteIdentifier(parseAdminJson(req, MAX_BODY_BYTES).quote_id);
    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendAdminJson(res, 404, { ok: false, code: "quote_not_found" });
    const paymentLinks = quote.payment_links || [];
    if (!paymentLinks.length) {
      return sendAdminJson(res, 200, { ok: true, deactivated: 0, workspace });
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
      return sendAdminJson(res, 200, { ok: true, deactivated, workspace: saved });
    } catch (error) {
      if (error.code !== "revision_conflict") throw error;
      const latest = await loadAdminWorkspace();
      const saved = await saveAdminWorkspace(
        removeLinks(latest, quoteId, linkIds, updatedAt),
        latest.revision
      );
      return sendAdminJson(res, 200, { ok: true, deactivated, workspace: saved });
    }
  } catch (error) {
    return sendAdminFailure(
      res,
      error,
      "Card links could not be deactivated. No quote changes were saved.",
      "admin_quote_payment_link_deactivation_failed"
    );
  }
}
