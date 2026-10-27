import { sendQuoteEmail } from "../lib/admin/sendQuoteEmail.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";
import { recordQuoteDelivery } from "../lib/admin/workspaceModel.js";
import {
  guardAdminJsonPost,
  parseAdminJson,
  requireAdminIdentifier,
  sendAdminFailure,
  sendAdminJson,
} from "../lib/admin/adminRequest.js";

const MAX_BODY_BYTES = 8 * 1024;

export default async function handler(req, res) {
  if (!guardAdminJsonPost(req, res)) return;

  try {
    const body = parseAdminJson(req, MAX_BODY_BYTES);
    const quoteId = requireAdminIdentifier(body.quote_id, "quote_id", 80);
    const idempotencyKey = requireAdminIdentifier(body.idempotency_key, "idempotency_key", 256);
    const deliveryKind = body.delivery_kind === "follow_up" ? "follow_up" : "initial";
    const note = String(body.note || "").trim();
    if (note.length > 1600) {
      const error = new Error("Email note is too long");
      error.code = "note_too_long";
      error.statusCode = 400;
      throw error;
    }

    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendAdminJson(res, 404, { ok: false, code: "quote_not_found" });
    if (deliveryKind === "follow_up" && quote.status !== "sent") {
      return sendAdminJson(res, 409, {
        ok: false,
        code: "follow_up_not_available",
        message: "Send the original quote before sending a follow-up.",
      });
    }
    if (["declined", "archived"].includes(quote.status)) {
      return sendAdminJson(res, 409, {
        ok: false,
        code: "quote_inactive",
        message: "Reopen this quote before sending it.",
      });
    }
    const client = workspace.clients.find((item) => item.id === quote.client_id);
    if (!client) return sendAdminJson(res, 409, { ok: false, code: "client_not_found" });

    const delivery = await sendQuoteEmail({
      quote,
      client,
      note,
      idempotencyKey,
      deliveryKind,
    });
    const sentAt = new Date().toISOString();
    const updated = recordQuoteDelivery(workspace, quote.id, {
      deliveryId: delivery.id,
      sentAt,
      deliveryKind,
    });

    try {
      const saved = await saveAdminWorkspace(updated, workspace.revision);
      console.log(JSON.stringify({
        event: deliveryKind === "follow_up" ? "admin_quote_follow_up_sent" : "admin_quote_sent",
        quote_id: quote.id,
        delivery_id: delivery.id,
      }));
      return sendAdminJson(res, 200, {
        ok: true,
        sent: true,
        delivery_kind: deliveryKind,
        status_saved: true,
        workspace: saved,
      });
    } catch (error) {
      if (error.code !== "revision_conflict") throw error;
      console.warn(JSON.stringify({ event: "admin_quote_sent_status_conflict", quote_id: quote.id, delivery_id: delivery.id }));
      return sendAdminJson(res, 200, {
        ok: true,
        sent: true,
        status_saved: false,
        delivery_id: delivery.id,
        message: "The email was sent, but the quote status changed in another tab. Refresh the workspace.",
      });
    }
  } catch (error) {
    return sendAdminFailure(res, error, "Quote email delivery is unavailable.", "admin_quote_send_failed");
  }
}
